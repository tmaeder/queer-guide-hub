package guide.queer.redirects;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.Collections;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import mockwebserver3.MockResponse;
import mockwebserver3.RecordedRequest;
import org.json.JSONObject;

/** Actual adapter/store code and core TLS, with package-private provider seams.
 * No Android runtime, signed installation or Google Play delivery is simulated as proof. */
public final class PlatformContractTests {
  private static final String PACKAGE="guide.queer.fixture";
  private static final UUID APP=UUID.fromString("10000000-0000-4000-8000-000000000001");
  private static JSONObject wire;
  private static String carrier;
  private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  private static void equal(Object actual,Object expected){if(!Objects.equals(actual,expected))throw new AssertionError("Unexpected contract result");}
  private interface Throwing {void run() throws Exception;}
  private static void fails(String reason,Throwing action) throws Exception {
    try{action.run();throw new AssertionError("Expected bounded failure: "+reason);}
    catch(PlayHandoffException failure){equal(failure.reason,reason);}
  }
  private static final class Environment implements PlayHandoffStore.Environment {
    final Path root;
    Environment() throws IOException{root=Files.createTempDirectory("qg-no-backup-");}
    Environment(Path root){this.root=root;}
    @Override public String packageName(){return PACKAGE;}
    @Override public File noBackupDirectory(){return root.toFile();}
    @Override public void syncDirectory(File directory) throws IOException {
      try(FileChannel channel=FileChannel.open(directory.toPath(),StandardOpenOption.READ)){channel.force(true);}
    }
    Path record(){return root.resolve("queer-guide-install-handoff/receipt.json");}
  }
  private static final class Reader implements PlayInstallHandoff.Reader {
    final String value;
    final AtomicInteger connects=new AtomicInteger(),reads=new AtomicInteger(),closes=new AtomicInteger();
    boolean unavailable,quiet,duplicate,blockingConnect;
    Reader(String value){this.value=value;}
    @Override public void connect(Listener listener){
      connects.incrementAndGet();
      if(blockingConnect){try{Thread.sleep(5000);}catch(InterruptedException stop){Thread.currentThread().interrupt();}return;}
      if(unavailable)listener.failed();else if(!quiet){listener.connected();if(duplicate)listener.connected();}
    }
    @Override public String read(){reads.incrementAndGet();return value;}
    @Override public void close(){closes.incrementAndGet();}
  }
  private static final class Result implements PlayInstallHandoff.Callback {
    final CompletableFuture<RedirectClient.Resolution> ready=new CompletableFuture<>();
    final AtomicInteger callbacks=new AtomicInteger();
    @Override public void onResponse(RedirectClient.Resolution value){callbacks.incrementAndGet();ready.complete(value);}
    @Override public void onFailure(IOException failure){callbacks.incrementAndGet();ready.completeExceptionally(failure);}
    RedirectClient.Resolution get() throws Exception{return ready.get(3,TimeUnit.SECONDS);}
    void failure(String reason) throws Exception {
      try{get();throw new AssertionError("Failure expected");}
      catch(ExecutionException failed){check(failed.getCause() instanceof PlayHandoffException,"Wrong failure type");equal(((PlayHandoffException)failed.getCause()).reason,reason);}
      equal(callbacks.get(),1);
    }
  }
  private static PlayInstallHandoff adapter(Environment environment,RedirectClient client,Reader reader) throws IOException {
    return new PlayInstallHandoff(environment,PACKAGE,Collections.singleton(APP),client,()->reader,150);
  }
  private static PlayHandoffStore store(Environment environment,RedirectClient client){return new PlayHandoffStore(environment,PACKAGE,Collections.singleton(APP),client);}
  private static void closedOnce(Reader reader) throws Exception {
    for(int wait=0;wait<100&&reader.closes.get()==0;wait++)Thread.sleep(5);
    equal(reader.closes.get(),1);
  }
  private static MockResponse consumed() {
    return new MockResponse.Builder().code(200).addHeader("Content-Type",RedirectClient.MEDIA_TYPE)
        .addHeader("X-QG-Handoff-State","consumed").body(wire.getJSONObject("body").toString()).build();
  }
  private static void carrierValidation() throws Exception {
    try(ContractTests.Fixture fixture=new ContractTests.Fixture()) {
      RedirectClient.HandoffReceipt valid=PlayHandoffCarrier.parse(carrier,Collections.singleton(APP),fixture.sdk);
      equal(valid.appBindingId,APP);equal(valid.canonicalUrl,URI.create("https://queer.guide/go/example-link"));
      for(String bad:Arrays.asList("",carrier+"&qg_v=1",carrier+"&unknown=1",carrier.replace("qg_v=1","qg_v=2"),
          carrier.replace("queer.guide","evil.example"),carrier.replace("qg_source=","qg_source=%00"),
          carrier.replace("qg_expires=","qg_expires=-"),carrier.replace("qg_token=","qg_token=%GG"),carrier+"%20"))
        fails("invalid_referrer",()->PlayHandoffCarrier.parse(bad,Collections.singleton(APP),fixture.sdk));
      fails("invalid_referrer",()->PlayHandoffCarrier.parse(carrier,Collections.singleton(UUID.randomUUID()),fixture.sdk));
      String query=carrier.replace("example-link", "example-link%3Fcampaign%3Dprivate");
      fails("invalid_referrer",()->PlayHandoffCarrier.parse(query,Collections.singleton(APP),fixture.sdk));
      equal(fixture.server.getRequestCount(),0);
    }
  }
  private static void resumeAndRestart() throws Exception {
    try(ContractTests.Fixture fixture=new ContractTests.Fixture()) {
      Environment environment=new Environment();Reader reader=new Reader(carrier);reader.duplicate=true;
      fixture.server.enqueue(consumed());
      try(PlayInstallHandoff adapter=adapter(environment,fixture.sdk,reader)) {
        Result result=new Result();adapter.resumeAutomatically(true,"current + password",result);
        RedirectClient.Resolution resolution=result.get();check(resolution.handoffConsumed,"Missing consumed acknowledgement");
        equal(resolution.clickId,UUID.fromString(wire.getJSONObject("body").getString("clickId")));
        RecordedRequest request=fixture.server.takeRequest(3,TimeUnit.SECONDS);check(request!=null&&request.getHandshake()!=null,"TLS required");
        equal(request.getUrl().query(),"qg_handoff=resume");equal(request.getMethod(),"POST");
        equal(request.getHeaders().get("X-QG-Handoff-App"),APP.toString());
        equal(request.getHeaders().get("X-QG-Handoff-Token"),wire.getJSONObject("headers").getString("x-qg-handoff-token"));
        equal(request.getBody().utf8(),"password="+URLEncoder.encode("current + password","UTF-8"));
        equal(reader.reads.get(),1);closedOnce(reader);
      }
      String record=new String(Files.readAllBytes(environment.record()),StandardCharsets.UTF_8);
      check(!record.contains("token")&&!record.contains("source")&&!record.contains("password"),"Consumed state retained private data");
      Reader restart=new Reader(carrier);
      try(PlayInstallHandoff adapter=adapter(environment,fixture.sdk,restart)) {
        Result result=new Result();adapter.resumeAutomatically(true,null,result);equal(result.get(),null);equal(restart.connects.get(),0);
        adapter.withdrawConsent();check(!Files.exists(environment.record()),"Withdrawal retained receipt");
      }
      equal(fixture.server.getRequestCount(),1);
    }
  }
  private static void unknownRetryAndWithdrawal() throws Exception {
    try(ContractTests.Fixture fixture=new ContractTests.Fixture()) {
      Environment environment=new Environment();PlayHandoffStore store=store(environment,fixture.sdk);
      PlayHandoffStore.State claim=store.begin(false);
      store.fetched(claim.claim,PlayHandoffCarrier.parse(carrier,Collections.singleton(APP),fixture.sdk));
      fails("already_attempted",()->store.begin(false));
      Reader reader=new Reader(carrier);
      fixture.server.enqueue(consumed());
      try(PlayInstallHandoff adapter=adapter(environment,fixture.sdk,reader)) {
        Result blocked=new Result();adapter.resumeAutomatically(true,null,blocked);blocked.failure("already_attempted");
        Result retried=new Result();adapter.retryAfterUserAction(true,null,retried);check(retried.get().handoffConsumed,"Explicit retry failed");equal(reader.connects.get(),0);
      }
      environment=new Environment();reader=new Reader(carrier);reader.quiet=true;
      try(PlayInstallHandoff adapter=adapter(environment,fixture.sdk,reader)) {
        Result result=new Result();adapter.resumeAutomatically(true,null,result);
        for(int step=0;step<100&&reader.connects.get()==0;step++)Thread.sleep(2);
        adapter.withdrawConsent();result.failure("consent_withdrawn");closedOnce(reader);
        check(!Files.exists(environment.record()),"Withdrawal did not clear durable marker");
      }
    }
  }
  private static void withdrawDuringHttp() throws Exception {
    try(ContractTests.Fixture fixture=new ContractTests.Fixture()) {
      Environment environment=new Environment();Reader reader=new Reader(carrier);
      fixture.server.enqueue(new MockResponse.Builder().code(200).addHeader("Content-Type",RedirectClient.MEDIA_TYPE)
          .addHeader("X-QG-Handoff-State","consumed").body(wire.getJSONObject("body").toString()).bodyDelay(1,TimeUnit.SECONDS).build());
      try(PlayInstallHandoff adapter=adapter(environment,fixture.sdk,reader)) {
        Result result=new Result();adapter.resumeAutomatically(true,null,result);
        check(fixture.server.takeRequest(3,TimeUnit.SECONDS)!=null,"Resume did not reach TLS");
        adapter.withdrawConsent();result.failure("consent_withdrawn");
        Thread.sleep(1100);equal(result.callbacks.get(),1);
        check(!Files.exists(environment.record()),"Late HTTP completion restored withdrawn receipt");
      }
      equal(fixture.server.getRequestCount(),1);
    }
  }
  private static void failureAndDeadlines() throws Exception {
    try(ContractTests.Fixture fixture=new ContractTests.Fixture()) {
      for(String mode:Arrays.asList("denied","unavailable","timeout","blocking","invalid")) {
        Environment environment=new Environment();Reader reader=new Reader(mode.equals("invalid")?"bad":carrier);
        reader.unavailable=mode.equals("unavailable");reader.quiet=mode.equals("timeout");reader.blockingConnect=mode.equals("blocking");
        try(PlayInstallHandoff adapter=adapter(environment,fixture.sdk,reader)) {
          Result result=new Result();adapter.resumeAutomatically(!mode.equals("denied"),null,result);
          result.failure(mode.equals("denied")?"consent_required":mode.equals("unavailable")?"referrer_unavailable":mode.equals("invalid")?"invalid_referrer":"referrer_timeout");
          if(mode.equals("denied")){equal(reader.connects.get(),0);check(!Files.exists(environment.record()),"Denied consent wrote state");}
          else {closedOnce(reader);fails("already_attempted",()->store(environment,fixture.sdk).begin(false));}
        }
      }
      equal(fixture.server.getRequestCount(),0);
      fails("invalid_configuration",()->new PlayInstallHandoff(new Environment(),"wrong.package",Collections.singleton(APP),fixture.sdk,()->new Reader(carrier),100));
    }
  }
  private static void storeIntegrityAndProcessRestart() throws Exception {
    try(RedirectClient client=new RedirectClient(Collections.singleton("queer.guide"),Collections.singleton("queer.guide"))) {
      Environment environment=new Environment();PlayHandoffStore store=store(environment,client);
      PlayHandoffStore.State first=store.begin(false);fails("already_attempted",()->store.begin(false));
      PlayHandoffStore.State retry=store.begin(true);check(!first.claim.equals(retry.claim),"Retry reused claim");
      fails("cancelled",()->store.fetched(first.claim,PlayHandoffCarrier.parse(carrier,Collections.singleton(APP),client)));
      JSONObject expired=new JSONObject(new String(Files.readAllBytes(environment.record()),StandardCharsets.UTF_8));expired.put("expires",1);
      Files.write(environment.record(),expired.toString().getBytes(StandardCharsets.UTF_8));
      Path orphan=environment.record().getParent().resolve("handoff-orphan.tmp");Files.write(orphan,new byte[]{1});
      store.begin(false);check(!Files.exists(orphan),"Expired orphan capability retained");store.clear();
      Files.write(environment.record(),"{}".getBytes(StandardCharsets.UTF_8));fails("invalid_store",()->store.begin(false));store.clear();
      Process[] children=new Process[2];
      for(int index=0;index<2;index++)children[index]=new ProcessBuilder(Paths.get(System.getProperty("java.home"),"bin/java").toString(),"-cp",System.getProperty("java.class.path"),PlatformContractTests.class.getName(),"claim",environment.root.toString()).redirectError(ProcessBuilder.Redirect.INHERIT).start();
      int claims=0;
      for(Process child:children){check(child.waitFor(10,TimeUnit.SECONDS),"Claimant hung");if(child.exitValue()==0)claims++;else equal(child.exitValue(),2);}
      equal(claims,1);fails("already_attempted",()->store.begin(false));store.clear();
    }
  }
  public static void main(String[] args) throws Exception {
    if(args.length==2&&args[0].equals("claim")) {
      try(RedirectClient client=new RedirectClient(Collections.singleton("queer.guide"),Collections.singleton("queer.guide"))) {
        try{store(new Environment(Paths.get(args[1])),client).begin(false);}
        catch(PlayHandoffException rejected){if(rejected.reason.equals("already_attempted")||rejected.reason.equals("store_busy")){System.exit(2);return;}throw rejected;}
      }
      return;
    }
    wire=new JSONObject(new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8));
    carrier=new String(Files.readAllBytes(Paths.get(args[1])),StandardCharsets.UTF_8);
    carrierValidation();resumeAndRestart();unknownRetryAndWithdrawal();withdrawDuringHttp();failureAndDeadlines();storeIntegrityAndProcessRestart();
    System.out.println("Play adapter: actual API21/Google2.2 compilation, browser-produced carrier validation, TLS resume, durable cross-process attempt, restart suppression, explicit retry, consent withdrawal, bounded provider errors/deadlines and private-state cleanup passed. Signed Play installation remains unverified.");
  }
}
