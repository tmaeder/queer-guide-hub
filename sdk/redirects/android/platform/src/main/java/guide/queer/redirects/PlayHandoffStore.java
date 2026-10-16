package guide.queer.redirects;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.JsonDataException;
import com.squareup.moshi.Moshi;
import com.squareup.moshi.Types;

/** App-wide install state: Play exposes one referrer for one installation.
 * All files are below Context.getNoBackupFilesDir(), with an OS file lock. */
final class PlayHandoffStore {
  interface Environment { String packageName(); File noBackupDirectory() throws IOException; void syncDirectory(File path) throws IOException; }
  static final class State {
    final String claim, status;
    final long expires;
    final RedirectClient.HandoffReceipt receipt;
    State(String claim,String status,long expires,RedirectClient.HandoffReceipt receipt) {
      this.claim=claim;this.status=status;this.expires=expires;this.receipt=receipt;
    }
  }
  private interface Work<T> { T run(File directory) throws IOException; }
  // FileChannel locks are per-process; this short monitor also serializes all
  // instances in this JVM. No service or HTTP work happens while either is held.
  private static final Object PROCESS_LOCK = new Object();
  private static final JsonAdapter<Map<String,Object>> JSON = new Moshi.Builder().build()
      .adapter(Types.newParameterizedType(Map.class,String.class,Object.class));
  private final Environment environment;
  private final String packageName;
  private final Set<UUID> bindings;
  private final RedirectClient client;
  PlayHandoffStore(Environment environment,String packageName,Set<UUID> bindings,RedirectClient client) {
    this.environment=environment;this.packageName=packageName;this.bindings=bindings;this.client=client;
  }
  State begin(boolean explicitRetry) throws IOException {
    return locked(true, directory -> {
      State previous=read(directory);
      if (previous!=null && previous.status.equals("consumed")) return null;
      if (previous!=null && !explicitRetry) throw new PlayHandoffException("already_attempted");
      State state=new State(UUID.randomUUID().toString(),previous!=null&&previous.receipt!=null?"attempted":"reading",
          previous!=null&&previous.receipt!=null?previous.expires:System.currentTimeMillis()+86400000L,
          previous==null?null:previous.receipt);
      write(directory,state); return state;
    });
  }
  void fetched(String claim,RedirectClient.HandoffReceipt receipt) throws IOException {
    locked(false, directory -> {
      State previous=read(directory);
      if(previous==null || !previous.claim.equals(claim) || !previous.status.equals("reading"))
        throw new PlayHandoffException("cancelled");
      write(directory,new State(claim,"attempted",receipt.expiresAtEpochMillis,receipt));return null;
    });
  }
  void consumed(String claim) throws IOException {
    locked(false, directory -> {
      State previous=read(directory);
      if(previous==null || !previous.claim.equals(claim) || !previous.status.equals("attempted"))
        throw new PlayHandoffException("consent_withdrawn");
      write(directory,new State(claim,"consumed",previous.expires,null));return null;
    });
  }
  void clear() throws IOException {
    locked(false, directory -> { if(directory!=null){remove(directory);clearTemporary(directory);}return null; });
  }
  private State read(File directory) throws IOException {
    if(directory==null)return null;
    File file=new File(directory,"receipt.json");
    if(!file.exists())return null;
    if(!file.isFile() || !file.getCanonicalFile().equals(file.getAbsoluteFile()) || file.length()>8192)
      throw new PlayHandoffException("invalid_store");
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    try(FileInputStream input=new FileInputStream(file)) {
      byte[] buffer=new byte[1024];int size;
      while((size=input.read(buffer))!=-1) { if(bytes.size()+size>8192)throw new PlayHandoffException("invalid_store");bytes.write(buffer,0,size); }
    }
    try {
      Map<String,Object> row=JSON.fromJson(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
      if(row==null || !"redirect-attribution-v1".equals(row.get("purpose")) || !packageName.equals(row.get("package"))
          || !(row.get("v") instanceof Number) || ((Number)row.get("v")).doubleValue()!=1
          || !(row.get("claim") instanceof String) || !((String)row.get("claim")).matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")
          || !Arrays.asList("reading","attempted","consumed").contains(row.get("status"))
          || !(row.get("expires") instanceof Number)) throw new PlayHandoffException("invalid_store");
      double expiry=((Number)row.get("expires")).doubleValue();long expires=(long)expiry;
      if((Double.isNaN(expiry)||Double.isInfinite(expiry))||expiry!=expires||expires>System.currentTimeMillis()+86401000L)
        throw new PlayHandoffException("invalid_store");
      if(expires<=System.currentTimeMillis()){remove(directory);clearTemporary(directory);return null;}
      Set<String> fields=new HashSet<>(Arrays.asList("v","purpose","package","claim","status","expires"));
      String status=(String)row.get("status");RedirectClient.HandoffReceipt receipt=null;
      if(status.equals("attempted")) {
        fields.addAll(Arrays.asList("app","source","token"));
        if(!(row.get("app") instanceof String)||!(row.get("source") instanceof String)||!(row.get("token") instanceof String))
          throw new PlayHandoffException("invalid_store");
        UUID app=UUID.fromString((String)row.get("app"));
        if(!((String)row.get("app")).matches("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")||!bindings.contains(app))throw new PlayHandoffException("invalid_store");
        receipt=new RedirectClient.HandoffReceipt(URI.create((String)row.get("source")),app,(String)row.get("token"),expires);
        client.newResumeCall(receipt,null,true).cancel();
      }
      if(!row.keySet().equals(fields))throw new PlayHandoffException("invalid_store");
      return new State((String)row.get("claim"),status,expires,receipt);
    } catch(IllegalArgumentException|JsonDataException|RedirectClient.RedirectException invalid) {
      throw new PlayHandoffException("invalid_store");
    }
  }
  private void write(File directory,State state) throws IOException {
    Map<String,Object> row=new HashMap<>();row.put("v",1);row.put("purpose","redirect-attribution-v1");row.put("package",packageName);
    row.put("claim",state.claim);row.put("status",state.status);row.put("expires",state.expires);
    if(state.receipt!=null){row.put("app",state.receipt.appBindingId.toString());row.put("source",state.receipt.canonicalUrl.toString());row.put("token",state.receipt.token);}
    byte[] bytes=JSON.toJson(row).getBytes(StandardCharsets.UTF_8);
    if(bytes.length>8192)throw new PlayHandoffException("invalid_store");
    File temporary=File.createTempFile("handoff-",".tmp",directory);
    try {
      privatePermissions(temporary,false);
      try(FileOutputStream output=new FileOutputStream(temporary)){output.write(bytes);output.flush();output.getFD().sync();}
      // Android/Linux rename is atomic within this same private directory. Never
      // delete the old marker first if replacement cannot be committed.
      if(!temporary.renameTo(new File(directory,"receipt.json")))throw new PlayHandoffException("store_unavailable");
      environment.syncDirectory(directory);
    } finally { if(temporary.exists()&&!temporary.delete())throw new PlayHandoffException("store_unavailable"); }
  }
  private void remove(File directory) throws IOException {
    File file=new File(directory,"receipt.json");
    if(file.exists()&&!file.delete())throw new PlayHandoffException("store_unavailable");
    environment.syncDirectory(directory);
  }
  private void clearTemporary(File directory) throws IOException {
    File[] files=directory.listFiles((parent,name)->name.startsWith("handoff-")&&name.endsWith(".tmp"));
    if(files==null||files.length>100)throw new PlayHandoffException("store_unavailable");
    for(File file:files)if(!file.delete())throw new PlayHandoffException("store_unavailable");
    environment.syncDirectory(directory);
  }
  private static void privatePermissions(File file,boolean directory) throws IOException {
    if(!file.setReadable(false,false)||!file.setWritable(false,false)||!file.setExecutable(false,false)
        ||!file.setReadable(true,true)||!file.setWritable(true,true)||directory&&!file.setExecutable(true,true))
      throw new PlayHandoffException("store_unavailable");
  }
  private <T>T locked(boolean create,Work<T> work) throws IOException {
    synchronized(PROCESS_LOCK) {
      try {
        File base=environment.noBackupDirectory().getCanonicalFile();
        File directory=new File(base,"queer-guide-install-handoff");
        if(!directory.exists()) {
          if(!create)return work.run(null);
          if(!directory.mkdirs()&&!directory.isDirectory())throw new PlayHandoffException("store_unavailable");
          environment.syncDirectory(base);
        }
        if(!directory.isDirectory() || !directory.getCanonicalFile().equals(directory.getAbsoluteFile()))throw new PlayHandoffException("store_unavailable");
        privatePermissions(directory,true);
        File lockFile=new File(directory,"receipt.lock");
        if(!lockFile.getCanonicalFile().equals(lockFile.getAbsoluteFile())||lockFile.exists()&&!lockFile.isFile())
          throw new PlayHandoffException("store_unavailable");
        try(RandomAccessFile lock=new RandomAccessFile(lockFile,"rw")) {
          privatePermissions(new File(directory,"receipt.lock"),false);
          try(FileLock held=lock.getChannel().tryLock()) {
            if(held==null)throw new PlayHandoffException("store_busy");
            return work.run(directory);
          }
        }
      } catch(PlayHandoffException known){throw known;}
      catch(IOException|RuntimeException invalid){throw new PlayHandoffException("store_unavailable");}
    }
  }
}
