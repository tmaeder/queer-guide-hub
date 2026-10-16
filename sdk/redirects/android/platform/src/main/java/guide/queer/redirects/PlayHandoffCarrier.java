package guide.queer.redirects;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Exact first-party carrier. The provider already scopes it to this package;
 * the adapter additionally requires an explicitly configured app binding/host. */
final class PlayHandoffCarrier {
  private PlayHandoffCarrier() { }
  static RedirectClient.HandoffReceipt parse(String referrer, Set<UUID> bindings,
      RedirectClient client) throws IOException {
    try {
      if (referrer == null || referrer.isEmpty() || referrer.length() > 512
          || URLEncoder.encode(referrer, "UTF-8").length() > 512)
        throw new PlayHandoffException("invalid_referrer");
      Map<String,String> values = new HashMap<>();
      for (String pair : referrer.split("&", -1)) {
        String[] parts = pair.split("=", 2);
        if (parts.length != 2) throw new PlayHandoffException("invalid_referrer");
        String key = URLDecoder.decode(parts[0], "UTF-8"), value = URLDecoder.decode(parts[1], "UTF-8");
        if (!key.matches("[a-z_]+") || !value.matches("[\\x21-\\x7e]+") || values.put(key,value) != null)
          throw new PlayHandoffException("invalid_referrer");
      }
      if (!values.keySet().equals(new HashSet<>(Arrays.asList("qg_v","qg_source","qg_app","qg_token","qg_expires")))
          || !"1".equals(values.get("qg_v")) || !values.get("qg_app").matches("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}")
          || !values.get("qg_expires").matches("[0-9]{13}")) throw new PlayHandoffException("invalid_referrer");
      UUID app = UUID.fromString(values.get("qg_app"));
      if (!bindings.contains(app)) throw new PlayHandoffException("invalid_referrer");
      RedirectClient.HandoffReceipt receipt = new RedirectClient.HandoffReceipt(URI.create(values.get("qg_source")),
          app,values.get("qg_token"),Long.parseLong(values.get("qg_expires")));
      // Preflight only: creating/cancelling a core call sends no request.
      client.newResumeCall(receipt,null,true).cancel();
      return receipt;
    } catch (IllegalArgumentException | RedirectClient.RedirectException invalid) {
      throw new PlayHandoffException("invalid_referrer");
    }
  }
}
