package guide.queer.redirects;

import java.io.IOException;
import java.net.CookieHandler;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.SocketFactory;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import mockwebserver3.SocketEffect;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.tls.HandshakeCertificates;
import okhttp3.tls.HeldCertificate;
import org.json.JSONObject;

/** Actual TLS and actual OkHttp; all sockets are confined to loopback. */
public final class ContractTests {
  private static final URI SOURCE = URI.create("https://queer.guide/go/example-link");
  private static final String ID = "10000000-0000-4000-8000-000000000001";
  private static Set<String> hosts(String... hosts) { return new HashSet<>(Arrays.asList(hosts)); }
  private static void equal(Object actual, Object expected) {
    if (!Objects.equals(actual, expected)) throw new AssertionError("Expected " + expected + ", got " + actual);
  }
  private static void check(boolean value, String reason) { if (!value) throw new AssertionError(reason); }
  private interface Throwing { void run() throws Exception; }
  private static void fails(String reason, Throwing run) throws Exception {
    try { run.run(); throw new AssertionError("Expected " + reason); }
    catch (RedirectClient.RedirectException error) { equal(error.reason, reason); }
  }
  private static String backendWire;
  private static JSONObject payload() {
    if (backendWire == null) throw new IllegalStateException("Backend wire fixture required");
    return new JSONObject(backendWire);
  }
  private static MockResponse.Builder response(JSONObject payload, int code) {
    return new MockResponse.Builder().code(code).addHeader("Content-Type", RedirectClient.MEDIA_TYPE).body(payload.toString());
  }
  private static RecordedRequest take(MockWebServer server) throws InterruptedException {
    RecordedRequest request = server.takeRequest(3, TimeUnit.SECONDS);
    check(request != null, "Missing TLS request"); check(request.getHandshake() != null, "TLS was not used");
    return request;
  }
  private static final class Fixture implements AutoCloseable {
    final MockWebServer server = new MockWebServer();
    final AtomicInteger cookieCalls = new AtomicInteger();
    final RedirectClient sdk;
    Fixture() throws IOException {
      HeldCertificate cert = new HeldCertificate.Builder().commonName("Native fixture")
        .addSubjectAlternativeName("queer.guide").addSubjectAlternativeName("www.queer.guide")
        .addSubjectAlternativeName("links.example.org").build();
      HandshakeCertificates serverTls = new HandshakeCertificates.Builder().heldCertificate(cert).build();
      HandshakeCertificates clientTls = new HandshakeCertificates.Builder().addTrustedCertificate(cert.certificate()).build();
      server.useHttps(serverTls.sslSocketFactory());
      server.setProtocols(Collections.singletonList(Protocol.HTTP_1_1));
      server.start(InetAddress.getLoopbackAddress(), 0);
      final int port = server.getPort();
      SocketFactory sockets = new SocketFactory() {
        @Override public Socket createSocket() {
          return new Socket() {
            @Override public void connect(SocketAddress endpoint, int timeout) throws IOException {
              InetSocketAddress target = (InetSocketAddress) endpoint;
              check(target.getAddress().isLoopbackAddress() && target.getPort() == 443, "External fixture connection denied");
              super.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), timeout);
            }
          };
        }
        @Override public Socket createSocket(String h, int p) { throw new UnsupportedOperationException(); }
        @Override public Socket createSocket(String h, int p, InetAddress l, int lp) { throw new UnsupportedOperationException(); }
        @Override public Socket createSocket(InetAddress h, int p) { throw new UnsupportedOperationException(); }
        @Override public Socket createSocket(InetAddress h, int p, InetAddress l, int lp) { throw new UnsupportedOperationException(); }
      };
      CookieJar cookies = new CookieJar() {
        @Override public List<Cookie> loadForRequest(HttpUrl url) { cookieCalls.incrementAndGet(); return Collections.emptyList(); }
        @Override public void saveFromResponse(HttpUrl url, List<Cookie> values) { cookieCalls.incrementAndGet(); }
      };
      OkHttpClient.Builder builder = new OkHttpClient.Builder().socketFactory(sockets)
        .sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager()).cookieJar(cookies)
        .dns(host -> {
          if (!hosts("queer.guide", "www.queer.guide", "links.example.org").contains(host)) throw new UnknownHostException("External fixture DNS denied");
          return Collections.singletonList(InetAddress.getLoopbackAddress());
        });
      sdk = new RedirectClient(hosts("queer.guide", "www.queer.guide", "links.example.org"), hosts("queer.guide"), builder);
    }
    @Override public void close() { sdk.close(); server.close(); }
  }

  private static void transportAndPasswords() throws Exception {
    try (Fixture f = new Fixture()) {
      AtomicInteger globalCookieCalls = new AtomicInteger(); CookieHandler previous = CookieHandler.getDefault();
      CookieHandler.setDefault(new CookieHandler() {
        @Override public Map<String,List<String>> get(URI uri, Map<String,List<String>> headers) {
          globalCookieCalls.incrementAndGet(); return Collections.singletonMap("Cookie", Collections.singletonList("private=secret"));
        }
        @Override public void put(URI uri, Map<String,List<String>> headers) { globalCookieCalls.incrementAndGet(); }
      });
      try {
        f.server.enqueue(response(payload(), 200).addHeader("Set-Cookie", "private=secret").build());
        RedirectClient.Resolution value = f.sdk.newCall(URI.create(SOURCE + "#secret-fragment")).execute();
        equal(value.navigation, RedirectClient.Navigation.APP); equal(value.clickId, null);
        RecordedRequest request = take(f.server);
        equal(request.getHeaders().get("Accept"), RedirectClient.MEDIA_TYPE);
        equal(request.getHeaders().get("X-QG-Attribution-Consent"), "denied");
        equal(request.getHeaders().get("Cookie"), null); equal(request.getHeaders().get("Authorization"), null);
        check(request.getHeaders().get("User-Agent").contains("Android"), "Missing Android device targeting");
        equal(request.getTarget(), "/go/example-link");
        f.server.enqueue(response(payload().put("statusCode",303), 200).build());
        RedirectClient.ResolutionCall call = f.sdk.newCall(SOURCE, "a+b &🦄", false);
        equal(call.execute().statusCode, 303); request = take(f.server);
        equal(request.getMethod(), "POST"); equal(request.getUrl().query(), null);
        check(request.getHeaders().get("Content-Type").startsWith("application/x-www-form-urlencoded"), "Wrong password form MIME");
        String form = request.getBody().utf8();
        check(form.startsWith("password=") && !form.contains("&") && form.contains("%2B"), "Password must remain one encoded form value");
        equal(java.net.URLDecoder.decode(form.substring(9), "UTF-8"), "a+b &🦄");
        equal(request.getHeaders().get("Cookie"), null);
        fails("already_executed", call::execute);
        equal(f.cookieCalls.get(), 0); equal(globalCookieCalls.get(), 0);
      } finally { CookieHandler.setDefault(previous); }
      f.server.enqueue(response(payload().put("canonicalUrl","https://links.example.org/"), 200).build());
      equal(f.sdk.newCall(URI.create("https://links.example.org")).execute().canonicalUrl.toString(), "https://links.example.org/"); take(f.server);
      RedirectClient.ResolutionCall unused = f.sdk.newCall(SOURCE); f.sdk.close();
      fails("client_closed", unused::execute); fails("client_closed", () -> f.sdk.newCall(SOURCE));
    }
  }
  private static void attributionAndNavigation() throws Exception {
    try (Fixture f = new Fixture()) {
      JSONObject tracked = payload().put("clickId", ID).put("destination", "https://queer.guide/venues/example?qg_click_id="+ID+"&x=a%2Bb#details");
      f.server.enqueue(response(tracked,200).build());
      RedirectClient.Resolution granted = f.sdk.newCall(SOURCE,null,true).execute();
      equal(granted.clickId, UUID.fromString(ID)); equal(take(f.server).getHeaders().get("X-QG-Attribution-Consent"), "granted");
      f.server.enqueue(response(tracked,200).build());
      RedirectClient.Resolution denied = f.sdk.newCall(SOURCE).execute(); take(f.server);
      equal(denied.clickId,null); equal(denied.destination.toString(),"https://queer.guide/venues/example?x=a%2Bb#details");
      for (JSONObject data : Arrays.asList(payload().put("mode","web"), payload().put("destination","https://example.org/content"),
          payload().put("destination","http://queer.guide/content"), payload().put("destination","https://queer.guide:8443/content"))) {
        f.server.enqueue(response(data,200).build());
        equal(f.sdk.newCall(SOURCE).execute().navigation,RedirectClient.Navigation.BROWSER); take(f.server);
      }
      f.server.enqueue(response(payload().put("canonicalUrl","https://www.queer.guide/go/EXAMPLE-LINK"),200).build());
      f.sdk.newCall(URI.create("https://QUEER.GUIDE/go/example-link")).execute(); take(f.server);
    }
  }
  private static void errorsAndValidation() throws Exception {
    try (Fixture f = new Fixture()) {
      int[] codes={400,401,404,405,410,429,502,503,508};
      String[] reasons={"invalid_request","password_required","not_found","method_not_allowed","unavailable","rate_limited","upstream_unavailable","temporarily_unavailable","loop"};
      for(int i=0;i<codes.length;i++) {
        f.server.enqueue(response(new JSONObject().put("protocol",1).put("error",reasons[i]),codes[i]).addHeader("Retry-After","900").build());
        try { f.sdk.newCall(SOURCE).execute(); throw new AssertionError("Missing error"); }
        catch(RedirectClient.RedirectException error) { equal(error.status,codes[i]);equal(error.reason,reasons[i]);equal(error.retryAfter,codes[i]==429?900:null); }
        take(f.server);
      }
      for(String retry:Arrays.asList("901","-1","1.5","Wed, 21 Oct 2026 07:28:00 GMT")) {
        f.server.enqueue(response(new JSONObject().put("protocol",1).put("error","rate_limited"),429).addHeader("Retry-After",retry).build());
        try { f.sdk.newCall(SOURCE).execute(); throw new AssertionError("Missing rate limit"); }
        catch(RedirectClient.RedirectException error) { equal(error.retryAfter,null); }
        take(f.server);
      }
      for(JSONObject data:Arrays.asList(payload().put("protocol",true),payload().put("protocol","1"),payload().put("protocol",2),payload().put("extra","private"),
          payload().put("statusCode",302.5),payload().put("statusCode",true),payload().put("mode","unknown"),payload().put("clickId",ID),
          payload().put("destination","https://queer.guide/?qg_click_id="+ID),payload().put("canonicalUrl","https://example.org/go/example-link"),
          payload().put("canonicalUrl",SOURCE+"?private=1"),payload().put("canonicalUrl","https://queer.guide/go/other-link"))) {
        f.server.enqueue(response(data,200).build()); fails("invalid_response", () -> f.sdk.newCall(SOURCE).execute()); take(f.server);
      }
      for(String target:Arrays.asList("http://127.0.0.1/","http://0177.0.0.1/","http://0x7f.0.0.1/","http://2130706433/","http://10.0.0.1/",
          "http://169.254.1.1/","http://172.16.0.1/","http://192.168.1.1/","http://100.64.0.1/","https://[::1]/","http://host.local/",
          "https://user:pass@example.org/","https://queer.guide:65536/content","javascript:alert(1)","file:///private/file")) {
        f.server.enqueue(response(payload().put("destination",target),200).build()); fails("invalid_response", () -> f.sdk.newCall(SOURCE).execute());take(f.server);
      }
      for(String link:Arrays.asList("http://queer.guide/go/example-link","https://example.org/go/example-link",SOURCE+"?password=secret",SOURCE+"?%70w=secret"))
        fails("invalid_link", () -> f.sdk.newCall(URI.create(link)));
      fails("invalid_password", () -> f.sdk.newCall(SOURCE, new String(new char[257]).replace('\0','x'),false));
      fails("invalid_configuration", () -> new RedirectClient(hosts("queer.guide/path"),hosts("queer.guide")));
      fails("invalid_configuration", () -> new RedirectClient(hosts(),hosts()));
    }
  }
  private static void limitsNoRedirectOrRetry() throws Exception {
    try(Fixture f=new Fixture()) {
      int count=f.server.getRequestCount();
      f.server.enqueue(new MockResponse.Builder().code(302).addHeader("Content-Type",RedirectClient.MEDIA_TYPE).addHeader("Location",SOURCE).body("{}").build());
      fails("invalid_response",()->f.sdk.newCall(SOURCE).execute());take(f.server);equal(f.server.getRequestCount(),count+1);
      f.server.enqueue(new MockResponse.Builder().code(200).addHeader("Content-Type","text/html").body("private upstream html").build());
      fails("invalid_response",()->f.sdk.newCall(SOURCE).execute());take(f.server);
      for (String malformed : Arrays.asList(payload().toString().replace("\"protocol\":1", "protocol:1"),
          payload().toString().replace('"', '\''), payload().toString()+"{}")) {
        f.server.enqueue(new MockResponse.Builder().addHeader("Content-Type",RedirectClient.MEDIA_TYPE).body(malformed).build());
        fails("invalid_response",()->f.sdk.newCall(SOURCE).execute());take(f.server);
      }
      String large=new String(new char[65537]).replace('\0',' ');
      for(MockResponse data:Arrays.asList(new MockResponse.Builder().addHeader("Content-Type",RedirectClient.MEDIA_TYPE).body(large).build(),
          new MockResponse.Builder().addHeader("Content-Type",RedirectClient.MEDIA_TYPE).chunkedBody(large,1024).build())) {
        f.server.enqueue(data);fails("response_too_large",()->f.sdk.newCall(SOURCE).execute());take(f.server);
      }
      count=f.server.getRequestCount();
      f.server.enqueue(new MockResponse.Builder().onResponseStart(new SocketEffect.CloseSocket()).build());
      try {f.sdk.newCall(SOURCE).execute();throw new AssertionError("Expected network failure");}catch(IOException expected){equal(((RedirectClient.RedirectException)expected).reason,"transport_failure");equal(expected.getCause(),null);}
      take(f.server);equal(f.server.getRequestCount(),count+1);
    }
  }
  private static void asyncCallbacksAndCancellation() throws Exception {
    try (Fixture f = new Fixture()) {
      f.server.enqueue(response(payload(),200).build());
      final CompletableFuture<RedirectClient.Resolution> ready = new CompletableFuture<>();
      RedirectClient.ResolutionCall call = f.sdk.newCall(SOURCE);
      call.enqueue(new RedirectClient.ResolutionCallback() {
        @Override public void onResponse(RedirectClient.Resolution result) { ready.complete(result); }
        @Override public void onFailure(IOException error) { ready.completeExceptionally(error); }
      });
      equal(ready.get(3,TimeUnit.SECONDS).navigation,RedirectClient.Navigation.APP);take(f.server);
      fails("already_executed",call::execute);
      f.server.enqueue(response(payload(),200).bodyDelay(3,TimeUnit.SECONDS).build());
      final CompletableFuture<RedirectClient.Resolution> canceled = new CompletableFuture<>();
      RedirectClient.ResolutionCall second = f.sdk.newCall(SOURCE);
      second.enqueue(new RedirectClient.ResolutionCallback() {
        @Override public void onResponse(RedirectClient.Resolution result) { canceled.complete(result); }
        @Override public void onFailure(IOException error) { canceled.completeExceptionally(error); }
      });
      take(f.server);second.cancel();
      try { canceled.get(3,TimeUnit.SECONDS);throw new AssertionError("Expected async cancellation"); }
      catch(ExecutionException expected) {equal(((RedirectClient.RedirectException)expected.getCause()).reason,"cancelled");}
    }
  }
  private static void cancellationAndWholeCallDeadline() throws Exception {
    try(Fixture f=new Fixture()) {
      ExecutorService worker=Executors.newSingleThreadExecutor();
      try {
        f.server.enqueue(response(payload(),200).bodyDelay(3,TimeUnit.SECONDS).build());
        RedirectClient.ResolutionCall call=f.sdk.newCall(SOURCE);Future<RedirectClient.Resolution> future=worker.submit(call::execute);
        take(f.server);call.cancel();check(call.isCanceled(),"Cancellation missing");
        try {future.get(3,TimeUnit.SECONDS);throw new AssertionError("Expected cancellation");}
        catch(ExecutionException expected){equal(((RedirectClient.RedirectException)expected.getCause()).reason,"cancelled");}
        f.server.enqueue(response(payload(),200).headersDelay(11,TimeUnit.SECONDS).build());
        long started=System.nanoTime();
        try {f.sdk.newCall(SOURCE).execute();throw new AssertionError("Expected ten-second deadline");}
        catch(IOException expected){equal(((RedirectClient.RedirectException)expected).reason,"transport_failure");long seconds=TimeUnit.NANOSECONDS.toSeconds(System.nanoTime()-started);check(seconds>=9&&seconds<=14,"Wrong call deadline");}
        take(f.server);
      } finally {worker.shutdownNow();}
    }
  }
  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("Backend wire fixture required");
    backendWire = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(args[0])), java.nio.charset.StandardCharsets.UTF_8);
    transportAndPasswords();attributionAndNavigation();errorsAndValidation();limitsNoRedirectOrRetry();asyncCallbacksAndCancellation();cancellationAndWholeCallDeadline();
    System.out.println("Android native core: Java8 compilation and actual loopback TLS/OkHttp prove forms, consent, root identity, browser fallback, strict payload/URL guards, errors, no cookies/credentials/redirects/retries, 64KiB limits, cancellation and ten-second deadline. No production or installed-device requests.");
  }
}
