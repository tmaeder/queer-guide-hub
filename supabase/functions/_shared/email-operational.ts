import { renderEmailTemplate } from "./email-render.ts";
const notices: Record<
  string,
  { subject: string; message: string; url: string }
> = {
  event_change: {
    subject: "An event you joined has changed",
    message: "Review the latest event schedule or cancellation in Queer Guide.",
    url: "https://queer.guide/hub",
  },
  event_reminder: {
    subject: "Your event starts within 24 hours",
    message: "Check the current details before you travel.",
    url: "https://queer.guide/hub",
  },
  trip_change: {
    subject: "Your trip schedule has changed",
    message: "Review the current dates and status in Queer Guide.",
    url: "https://queer.guide/trips",
  },
  trip_reminder: {
    subject: "Your trip starts tomorrow (UTC)",
    message: "Review your current trip plan before you travel.",
    url: "https://queer.guide/trips",
  },
  group_request: {
    subject: "Your group request has a decision",
    message: "Sign in to review the outcome of your request.",
    url: "https://queer.guide/hub/groups",
  },
  group_invitation: {
    subject: "You have a group invitation to review",
    message:
      "Sign in to review the invitation. Opening this email does not join the group.",
    url: "https://queer.guide/hub/groups",
  },
  contribution: {
    subject: "Your contribution has a decision",
    message: "Sign in to review the outcome of your contribution.",
    url: "https://queer.guide/hub",
  },
  payment: {
    subject: "Your payment confirmation is ready",
    message:
      "Your payment provider confirmed your payment. Sign in to review your contribution. This notification is not a tax receipt.",
    url: "https://queer.guide/hub",
  },
};
export function operationalEmail(kind: string) {
  const notice = notices[kind];
  if (!notice) throw new Error("Unsupported operational purpose");
  return renderEmailTemplate({
    subject: "{{subject}}",
    html_content:
      '<h2>{{subject}}</h2><p>{{message}}</p><p><a href="{{action_url}}">Open Queer Guide</a></p><p>You requested this type of service update. <a href="{{preferences_url}}">Change email settings</a>.</p>',
    text_content:
      "{{subject}}. {{message}} Open {{action_url}}. Email settings: {{preferences_url}}",
  }, {
    ...notice,
    action_url: notice.url,
    preferences_url: "https://queer.guide/settings?section=account",
  });
}
