package guide.queer.redirects;

import android.content.Context;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import java.io.File;
import java.io.FileDescriptor;
import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Optional Android21+ Play Install Referrer delivery. Requires current consent
 * and actual package/binding configuration; never retries automatically. */
public final class PlayInstallHandoff implements AutoCloseable {
  public interface Callback {
    /** Null means this installation was already consumed; no navigation is owed. */
    void onResponse(RedirectClient.Resolution resolution);
    void onFailure(IOException error);
  }
  interface Reader {
    interface Listener { void connected(); void failed(); }
    void connect(Listener listener);
    String read() throws IOException;
    void close();
  }
  interface ReaderFactory { Reader create(); }
  private final PlayHandoffStore store;
  private final Set<UUID> bindings;
  private final RedirectClient client;
  private final ReaderFactory readers;
  private final ExecutorService work=Executors.newCachedThreadPool();
  private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
  private final ConcurrentHashMap<Operation,Boolean> active=new ConcurrentHashMap<>();
  private final AtomicBoolean closed=new AtomicBoolean();
  private final long serviceDeadlineMillis;

  public PlayInstallHandoff(Context context,String expectedPackage,UUID binding,RedirectClient client) throws PlayHandoffException {
    this(context,expectedPackage,Collections.singleton(binding),client);
  }
  public PlayInstallHandoff(Context context,String expectedPackage,Set<UUID> bindings,RedirectClient client) throws PlayHandoffException {
    this(environment(context),expectedPackage,bindings,client,googleReaders(context),10000);
  }
  // Filesystem/provider seams are module-only and cannot authorize production
  // package identity, an Android Context or Play delivery from a JVM fixture.
  PlayInstallHandoff(PlayHandoffStore.Environment environment,String expectedPackage,Set<UUID> bindings,
      RedirectClient client,ReaderFactory readers,long serviceDeadlineMillis) throws PlayHandoffException {
    if(environment==null||expectedPackage==null||expectedPackage.length()>255
        ||!expectedPackage.matches("[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+")
        ||!expectedPackage.equals(environment.packageName())||bindings==null||bindings.isEmpty()||bindings.size()>20
        ||client==null||readers==null||serviceDeadlineMillis<1||serviceDeadlineMillis>10000)
      throw new PlayHandoffException("invalid_configuration");
    for(UUID binding:bindings)if(binding==null)throw new PlayHandoffException("invalid_configuration");
    this.bindings=Collections.unmodifiableSet(new HashSet<>(bindings));this.client=client;this.readers=readers;
    this.serviceDeadlineMillis=serviceDeadlineMillis;
    this.store=new PlayHandoffStore(environment,expectedPackage,this.bindings,client);
  }
  public Operation resumeAutomatically(boolean attributionConsent,String password,Callback callback) throws PlayHandoffException {
    return start(attributionConsent,password,callback,false);
  }
  /** Only a fresh explicit user action may retry an uncertain provider/HTTP result. */
  public Operation retryAfterUserAction(boolean attributionConsent,String password,Callback callback) throws PlayHandoffException {
    return start(attributionConsent,password,callback,true);
  }
  private synchronized Operation start(boolean consent,String password,Callback callback,boolean explicitRetry) throws PlayHandoffException {
    if(callback==null)throw new IllegalArgumentException("Callback required");
    if(closed.get())throw new PlayHandoffException("adapter_closed");
    if(!active.isEmpty())throw new PlayHandoffException("operation_in_progress");
    Operation operation=new Operation(callback,password);
    active.put(operation,Boolean.TRUE);
    try {
      work.execute(()->{
        try {
          if(!consent){store.clear();operation.fail(new PlayHandoffException("consent_required"));return;}
          if(password!=null&&(password.isEmpty()||password.length()>256))throw new PlayHandoffException("invalid_password");
          synchronized(operation) {
            if(operation.done)return;
            operation.state=store.begin(explicitRetry);
            if(operation.state==null){operation.succeed(null);return;}
            if(operation.state.receipt!=null){operation.resolve(operation.state.receipt);return;}
            operation.reader=readers.create();
            if(operation.reader==null)throw new PlayHandoffException("referrer_unavailable");
            operation.deadline=timer.schedule(()->operation.fail(new PlayHandoffException("referrer_timeout")),serviceDeadlineMillis,TimeUnit.MILLISECONDS);
          }
          synchronized(operation) {if(operation.done)return;}
          operation.reader.connect(new Reader.Listener() {
            @Override public void connected() {
              if(!operation.readStarted.compareAndSet(false,true))return;
              operation.executeRead();
            }
            @Override public void failed(){operation.fail(new PlayHandoffException("referrer_unavailable"));}
          });
        } catch(IOException|RuntimeException error) {operation.fail(error instanceof IOException?(IOException)error:new PlayHandoffException("referrer_unavailable"));}
      });
    } catch(RejectedExecutionException stopped){operation.fail(new PlayHandoffException("adapter_closed"));}
    return operation;
  }
  /** Cancel current work and remove all SDK receipt/temporary capability data. */
  public void withdrawConsent() throws IOException {
    for(Operation operation:active.keySet())operation.fail(new PlayHandoffException("consent_withdrawn"));
    store.clear();
  }
  public final class Operation {
    private final Callback callback;
    private final String password;
    private boolean done;
    private final AtomicBoolean readStarted=new AtomicBoolean(), readerClosed=new AtomicBoolean();
    private Reader reader;
    private RedirectClient.ResolutionCall call;
    private PlayHandoffStore.State state;
    private ScheduledFuture<?> deadline;
    private Operation(Callback callback,String password){this.callback=callback;this.password=password;}
    public void cancel(){fail(new PlayHandoffException("cancelled"));}
    private void executeRead() {
      try {work.execute(()->{
        try {
          synchronized(this){if(done)return;}
          String raw=reader.read();
          RedirectClient.HandoffReceipt receipt=PlayHandoffCarrier.parse(raw,bindings,client);
          synchronized(this) {
            if(done)return;
            store.fetched(state.claim,receipt);
            if(deadline!=null)deadline.cancel(false);
            closeReader();resolve(receipt);
          }
        } catch(IOException|RuntimeException error){fail(error instanceof IOException?(IOException)error:new PlayHandoffException("referrer_unavailable"));}
        finally {closeReader();}
      });} catch(RejectedExecutionException stopped){fail(new PlayHandoffException("adapter_closed"));}
    }
    private synchronized void resolve(RedirectClient.HandoffReceipt receipt) throws IOException {
      if(done)return;
      call=client.newResumeCall(receipt,password,true);
      call.enqueue(new RedirectClient.ResolutionCallback() {
        @Override public void onResponse(RedirectClient.Resolution resolution){succeed(resolution);}
        @Override public void onFailure(IOException error){fail(error);}
      });
    }
    private synchronized void succeed(RedirectClient.Resolution resolution) {
      if(done)return;
      try {
        if(resolution!=null)store.consumed(state.claim);
      } catch(IOException unavailable){fail(unavailable);return;}
      done=true;finish();callback.onResponse(resolution);
    }
    private synchronized void fail(IOException error) {
      if(done)return;done=true;
      if(call!=null)call.cancel();finish();callback.onFailure(error);
    }
    private void finish(){if(deadline!=null)deadline.cancel(false);active.remove(this);closeReader();}
    private void closeReader() {
      Reader current=reader;
      if(current==null||!readerClosed.compareAndSet(false,true))return;
      // A slow Binder call must not hold up cancellation/deadline delivery.
      // Closing is attempted once on its own daemon, including after disconnect.
      Thread cleanup=new Thread(()->{try{current.close();}catch(RuntimeException ignored){/* No provider data is logged. */}},"qg-install-referrer-close");
      cleanup.setDaemon(true);cleanup.start();
    }
  }
  private static Context application(Context context) throws PlayHandoffException {
    if(context==null||context.getApplicationContext()==null)throw new PlayHandoffException("invalid_configuration");
    return context.getApplicationContext();
  }
  private static PlayHandoffStore.Environment environment(Context context) throws PlayHandoffException {
    final Context app=application(context);
    return new PlayHandoffStore.Environment() {
      @Override public String packageName(){return app.getPackageName();}
      @Override public File noBackupDirectory() throws IOException {
        File directory=app.getNoBackupFilesDir();if(directory==null)throw new PlayHandoffException("store_unavailable");return directory;
      }
      @Override public void syncDirectory(File path) throws IOException {
        FileDescriptor descriptor=null;
        try {descriptor=Os.open(path.getPath(),OsConstants.O_RDONLY,0);Os.fsync(descriptor);}
        catch(ErrnoException unavailable){throw new PlayHandoffException("store_unavailable");}
        finally {if(descriptor!=null)try{Os.close(descriptor);}catch(ErrnoException ignored){/* Already synchronized, no capability is logged. */}}
      }
    };
  }
  private static ReaderFactory googleReaders(Context context) throws PlayHandoffException {
    final Context app=application(context);
    return ()->new Reader() {
      private final InstallReferrerClient referrer=InstallReferrerClient.newBuilder(app).build();
      private boolean stopped;
      @Override public synchronized void connect(Reader.Listener listener) {
        if(stopped)return;
        referrer.startConnection(new InstallReferrerStateListener() {
          @Override public void onInstallReferrerSetupFinished(int code) {
            if(code==InstallReferrerClient.InstallReferrerResponse.OK)listener.connected();else listener.failed();
          }
          @Override public void onInstallReferrerServiceDisconnected(){listener.failed();}
        });
      }
      @Override public String read() throws IOException {
        try{return referrer.getInstallReferrer().getInstallReferrer();}
        catch(android.os.RemoteException|RuntimeException unavailable){throw new PlayHandoffException("referrer_unavailable");}
      }
      @Override public synchronized void close(){stopped=true;referrer.endConnection();}
    };
  }
  @Override public void close() {
    if(!closed.compareAndSet(false,true))return;
    for(Operation operation:active.keySet())operation.cancel();
    timer.shutdownNow();work.shutdownNow();
  }
}
