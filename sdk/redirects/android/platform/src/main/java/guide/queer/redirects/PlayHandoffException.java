package guide.queer.redirects;

import java.io.IOException;

/** Bounded reason only; never includes a referrer, capability or provider body. */
public final class PlayHandoffException extends IOException {
  private static final long serialVersionUID = 1L;
  public final String reason;
  PlayHandoffException(String reason) { super(reason); this.reason = reason; }
}
