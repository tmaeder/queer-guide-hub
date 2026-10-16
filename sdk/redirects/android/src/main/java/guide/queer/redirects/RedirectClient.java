package guide.queer.redirects;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.Authenticator;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.ConnectionPool;
import okhttp3.CookieJar;
import okhttp3.Dispatcher;
import okhttp3.FormBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import com.squareup.moshi.JsonAdapter;
import com.squareup.moshi.JsonDataException;
import com.squareup.moshi.Moshi;
import com.squareup.moshi.Types;

/** Stateless native resolution. Use from a background thread; each call is a visit. */
public final class RedirectClient implements AutoCloseable {
  public static final String MEDIA_TYPE = "application/vnd.queer-guide.redirect+json";
  private final Set<String> shortHosts;
  private final Set<String> contentHosts;
  private final OkHttpClient client;
  private final AtomicBoolean closed = new AtomicBoolean();
  private static final JsonAdapter<Map<String, Object>> JSON = new Moshi.Builder().build()
    .adapter(Types.newParameterizedType(Map.class, String.class, Object.class));
  private static final Map<Integer, String> PROBLEMS;
  static {
    Map<Integer, String> errors = new HashMap<>();
    int[] codes = {400,401,404,405,410,429,502,503,508};
    String[] names = {"invalid_request","password_required","not_found","method_not_allowed",
      "unavailable","rate_limited","upstream_unavailable","temporarily_unavailable","loop"};
    for (int i = 0; i < codes.length; i++) errors.put(codes[i], names[i]);
    PROBLEMS = Collections.unmodifiableMap(errors);
  }

  public enum Navigation { APP, BROWSER }
  public static final class Resolution {
    public final URI canonicalUrl;
    public final URI destination;
    public final int statusCode;
    public final UUID clickId;
    public final Navigation navigation;
    private Resolution(URI canonicalUrl, URI destination, int statusCode, UUID clickId, Navigation navigation) {
      this.canonicalUrl = canonicalUrl; this.destination = destination;
      this.statusCode = statusCode; this.clickId = clickId; this.navigation = navigation;
    }
  }
  public static final class RedirectException extends IOException {
    private static final long serialVersionUID = 1L;
    public final String reason;
    public final int status;
    public final Integer retryAfter;
    private RedirectException(String reason) { this(reason, 0, null); }
    private RedirectException(String reason, int status, Integer retryAfter) {
      super(reason); this.reason = reason; this.status = status; this.retryAfter = retryAfter;
    }
  }

  public RedirectClient(Set<String> shortHosts, Set<String> contentHosts) throws RedirectException {
    this(shortHosts, contentHosts, new OkHttpClient.Builder());
  }
  // Package-private transport seam for isolated TLS fixtures, not app configuration.
  RedirectClient(Set<String> shortHosts, Set<String> contentHosts, OkHttpClient.Builder builder) throws RedirectException {
    this.shortHosts = hosts(shortHosts); this.contentHosts = hosts(contentHosts);
    if (this.shortHosts.isEmpty()) throw new RedirectException("invalid_configuration");
    builder.interceptors().clear(); builder.networkInterceptors().clear();
    client = builder.cookieJar(CookieJar.NO_COOKIES).cache(null)
      .authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE)
      .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
      .callTimeout(10, TimeUnit.SECONDS).connectTimeout(10, TimeUnit.SECONDS)
      .readTimeout(10, TimeUnit.SECONDS).writeTimeout(10, TimeUnit.SECONDS)
      .dispatcher(new Dispatcher()).connectionPool(new ConnectionPool()).build();
  }
  private static Set<String> hosts(Set<String> input) throws RedirectException {
    if (input == null) throw new RedirectException("invalid_configuration");
    Set<String> result = new HashSet<>();
    for (String raw : input) {
      if (raw == null) throw new RedirectException("invalid_configuration");
      String host = raw.toLowerCase(Locale.ROOT);
      try {
        URI url = publicUrl("https://" + host, 4096, true);
        if (!host.equals(url.getHost()) || !url.getRawPath().isEmpty() || url.getRawQuery() != null || url.getRawFragment() != null)
          throw new RedirectException("invalid_configuration");
      } catch (RedirectException invalid) { throw new RedirectException("invalid_configuration"); }
      result.add(host);
    }
    return Collections.unmodifiableSet(result);
  }

  public ResolutionCall newCall(URI link) throws RedirectException { return newCall(link, null, false); }
  public ResolutionCall newCall(URI link, String password, boolean attributionConsent) throws RedirectException {
    if (closed.get()) throw new RedirectException("client_closed");
    if (link == null) throw new RedirectException("invalid_link");
    URI source = publicUrl(link.toString(), 4096, true);
    if (!shortHosts.contains(source.getHost().toLowerCase(Locale.ROOT))) throw new RedirectException("invalid_link");
    for (String[] pair : query(source)) if (pair[0].equals("pw") || pair[0].equals("password")) throw new RedirectException("invalid_link");
    String raw = source.toString(); int hash = raw.indexOf('#');
    if (hash >= 0) raw = raw.substring(0, hash);
    Request.Builder request = new Request.Builder().url(raw)
      .header("Accept", MEDIA_TYPE).header("X-QG-Attribution-Consent", attributionConsent ? "granted" : "denied")
      .header("User-Agent", "QueerGuideRedirects/1 (Android)");
    if (password != null) {
      if (password.isEmpty() || password.length() > 256) throw new RedirectException("invalid_password");
      request.post(new FormBody.Builder().add("password", password).build());
    }
    return new ResolutionCall(client.newCall(request.build()), source, attributionConsent);
  }

  public interface ResolutionCallback {
    void onResponse(Resolution result);
    void onFailure(IOException error);
  }
  public final class ResolutionCall {
    private final Call call;
    private final URI source;
    private final boolean consent;
    private final AtomicBoolean executed = new AtomicBoolean();
    private final AtomicBoolean canceled = new AtomicBoolean();
    private ResolutionCall(Call call, URI source, boolean consent) { this.call = call; this.source = source; this.consent = consent; }
    public void cancel() { canceled.set(true); call.cancel(); }
    public boolean isCanceled() { return call.isCanceled(); }
    /** Blocking: run on your app's I/O executor. One execution; no SDK retry. */
    public Resolution execute() throws IOException {
      begin();
      try { return consume(call.execute()); } catch (IOException error) { throw failure(error); }
    }
    /** Callbacks run on OkHttp's worker; dispatch UI updates to your main thread. */
    public void enqueue(final ResolutionCallback callback) throws RedirectException {
      if (callback == null) throw new IllegalArgumentException("callback required");
      begin();
      call.enqueue(new Callback() {
        @Override public void onFailure(Call ignored, IOException error) { callback.onFailure(failure(error)); }
        @Override public void onResponse(Call ignored, Response response) {
          final Resolution result;
          try { result = consume(response); }
          catch (IOException error) { callback.onFailure(failure(error)); return; }
          callback.onResponse(result);
        }
      });
    }
    private RedirectException failure(IOException error) {
      if (error instanceof RedirectException) return (RedirectException) error;
      if (closed.get()) return new RedirectException("client_closed");
      if (canceled.get()) return new RedirectException("cancelled");
      // Transport exception messages can include raw status lines/URLs. Do not
      // retain an upstream message/cause or expose it through the public SDK.
      return new RedirectException("transport_failure");
    }
    private void begin() throws RedirectException {
      if (!executed.compareAndSet(false, true)) throw new RedirectException("already_executed");
      if (closed.get()) { call.cancel(); throw new RedirectException("client_closed"); }
    }
    private Resolution consume(Response upstream) throws IOException {
      try (Response response = upstream) {
        String mime = response.header("Content-Type", "").split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!MEDIA_TYPE.equals(mime) || !response.request().url().equals(call.request().url())) throw new RedirectException("invalid_response");
        ResponseBody body = response.body();
        if (body.contentLength() > 65536) throw new RedirectException("response_too_large");
        byte[] bytes;
        try (InputStream stream = body.byteStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
          byte[] buffer = new byte[4096]; int length;
          while ((length = stream.read(buffer)) != -1) {
            if (length > 65536 - output.size()) throw new RedirectException("response_too_large");
            output.write(buffer, 0, length);
          }
          bytes = output.toByteArray();
        }
        return decode(bytes, response.code(), response.header("Retry-After"), source, consent);
      }
    }
  }

  Resolution decode(byte[] bytes, int status, String retry, URI source, boolean consent) throws RedirectException {
    try {
      if (bytes.length > 65536) throw new RedirectException("response_too_large");
      String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
      Map<String, Object> data = JSON.fromJson(text);
      if (data == null || !number(data.get("protocol"), 1)) throw new RedirectException("invalid_response");
      if (status != 200) {
        if (!data.keySet().equals(new HashSet<>(Arrays.asList("protocol", "error"))) || !PROBLEMS.containsKey(status)
            || !PROBLEMS.get(status).equals(data.get("error"))) throw new RedirectException("invalid_response");
        Integer after = null;
        if (status == 429 && retry != null && retry.matches("[0-9]{1,3}")) {
          int seconds = Integer.parseInt(retry); if (seconds > 0 && seconds <= 900) after = seconds;
        }
        throw new RedirectException(PROBLEMS.get(status), status, after);
      }
      if (!data.keySet().equals(new HashSet<>(Arrays.asList("protocol", "canonicalUrl", "destination", "statusCode", "mode", "clickId"))))
        throw new RedirectException("invalid_response");
      URI canonical = publicUrl(string(data.get("canonicalUrl")), 4096, true);
      URI target = publicUrl(string(data.get("destination")), 60000, false);
      String mode = string(data.get("mode")); Object code = data.get("statusCode");
      if (canonical.getRawQuery() != null || canonical.getRawFragment() != null || !Arrays.asList("navigate", "web").contains(mode)
          || !(code instanceof Number) || !Arrays.asList(301,302,303,307,308).contains(((Number) code).intValue())
          || !number(code, ((Number) code).intValue())) throw new RedirectException("invalid_response");
      String actualHost = canonical.getHost().toLowerCase(Locale.ROOT), sourceHost = source.getHost().toLowerCase(Locale.ROOT);
      Set<String> builtin = new HashSet<>(Arrays.asList("queer.guide", "www.queer.guide"));
      if (!(actualHost.equals(sourceHost) || builtin.contains(actualHost) && builtin.contains(sourceHost))
          || !path(canonical).equalsIgnoreCase(path(source))) throw new RedirectException("invalid_response");
      List<String> ids = new ArrayList<>();
      for (String[] pair : query(target)) if (pair[0].equals("qg_click_id")) ids.add(pair[1]);
      UUID id = null; Object click = data.get("clickId");
      if (click == null) { if (!ids.isEmpty()) throw new RedirectException("invalid_response"); }
      else {
        String rawId = string(click);
        if (!rawId.matches("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")
            || ids.size() != 1 || !ids.get(0).equals(rawId)) throw new RedirectException("invalid_response");
        if (consent) id = UUID.fromString(rawId);
      }
      if (!consent) target = withoutClickId(target);
      boolean app = mode.equals("navigate") && target.getScheme().equalsIgnoreCase("https")
        && (target.getPort() == -1 || target.getPort() == 443) && contentHosts.contains(target.getHost().toLowerCase(Locale.ROOT));
      return new Resolution(canonical, target, ((Number) code).intValue(), id, app ? Navigation.APP : Navigation.BROWSER);
    } catch (RedirectException invalid) {
      if (invalid.status == 0 && !invalid.reason.equals("response_too_large")) throw new RedirectException("invalid_response");
      throw invalid;
    } catch (IOException | IllegalArgumentException | JsonDataException invalid) {
      throw new RedirectException("invalid_response");
    }
  }
  private static boolean number(Object value, int expected) {
    return value instanceof Number && ((Number) value).doubleValue() == expected;
  }
  private static String string(Object value) throws RedirectException {
    if (!(value instanceof String)) throw new RedirectException("invalid_response"); return (String) value;
  }
  private static List<String[]> query(URI url) throws RedirectException {
    List<String[]> result = new ArrayList<>(); if (url.getRawQuery() == null) return result;
    try {
      for (String pair : url.getRawQuery().split("&", -1)) {
        String[] parts = pair.split("=", 2);
        result.add(new String[]{URLDecoder.decode(parts[0], "UTF-8"), URLDecoder.decode(parts.length == 2 ? parts[1] : "", "UTF-8")});
      }
      return result;
    } catch (IOException | IllegalArgumentException invalid) { throw new RedirectException("invalid_link"); }
  }
  private static URI withoutClickId(URI url) throws RedirectException {
    if (url.getRawQuery() == null) return url;
    List<String> kept = new ArrayList<>();
    try {
      for (String pair : url.getRawQuery().split("&", -1))
        if (!URLDecoder.decode(pair.split("=", 2)[0], "UTF-8").equals("qg_click_id")) kept.add(pair);
      return new URI(url.getScheme() + "://" + url.getRawAuthority() + url.getRawPath()
        + (kept.isEmpty() ? "" : "?" + join(kept)) + (url.getRawFragment() == null ? "" : "#" + url.getRawFragment()));
    } catch (IOException | URISyntaxException invalid) { throw new RedirectException("invalid_response"); }
  }
  private static String path(URI url) { return url.getPath().isEmpty() ? "/" : url.getPath(); }
  // String.join requires Android26; avoid it for the Android21 contract.
  private static String join(List<String> values) {
    StringBuilder result = new StringBuilder();
    for (int i = 0; i < values.size(); i++) { if (i > 0) result.append('&'); result.append(values.get(i)); }
    return result.toString();
  }
  private static URI publicUrl(String raw, int maximum, boolean https) throws RedirectException {
    try {
      if (raw.isEmpty() || raw.length() > maximum || raw.matches("(?s).*\\s.*") || raw.indexOf('\\') >= 0) throw new URISyntaxException("", "unsafe");
      URI url = new URI(raw); String host = url.getHost(), scheme = url.getScheme();
      if (host == null || scheme == null || !Arrays.asList("http", "https").contains(scheme.toLowerCase(Locale.ROOT))
          || https && (!scheme.equalsIgnoreCase("https") || url.getPort() != -1 && url.getPort() != 443)
          || url.getPort() > 65535 || url.getRawUserInfo() != null || !host.contains(".") || !host.matches("(?i)[a-z0-9.-]+") || host.endsWith(".")) throw new URISyntaxException("", "unsafe");
      host = host.toLowerCase(Locale.ROOT); String[] labels = host.split("\\.", -1);
      if (Arrays.asList("localhost","local","internal","home","test","invalid","example").contains(labels[labels.length-1])) throw new URISyntaxException("", "unsafe");
      for (String label : labels) if (label.isEmpty() || label.length() > 63 || label.startsWith("-") || label.endsWith("-")) throw new URISyntaxException("", "unsafe");
      if (host.matches("(?:[0-9]+|0x[a-f0-9]+)(?:\\.(?:[0-9]+|0x[a-f0-9]+))*")) {
        if (labels.length != 4) throw new URISyntaxException("", "unsafe");
        int[] ip = new int[4];
        for (int i=0; i<4; i++) {
          if (!labels[i].matches("0|[1-9][0-9]{0,2}")) throw new URISyntaxException("", "unsafe");
          ip[i] = Integer.parseInt(labels[i]); if (ip[i] > 255) throw new URISyntaxException("", "unsafe");
        }
        int a=ip[0], b=ip[1];
        if (a==0 || a==10 || a==127 || a>=224 || a==169&&b==254 || a==172&&b>=16&&b<=31 || a==192&&b==168 || a==100&&b>=64&&b<=127)
          throw new URISyntaxException("", "unsafe");
      }
      return url;
    } catch (URISyntaxException | IllegalArgumentException invalid) { throw new RedirectException("invalid_link"); }
  }
  @Override public void close() {
    if (!closed.compareAndSet(false, true)) return;
    client.dispatcher().cancelAll(); client.connectionPool().evictAll(); client.dispatcher().executorService().shutdown();
  }
}
