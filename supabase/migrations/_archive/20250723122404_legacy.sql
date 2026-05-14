-- Create email templates table
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Email templates are viewable by admins" 
ON public.email_templates 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email templates" 
ON public.email_templates 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default email templates
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, text_content, variables) VALUES
('welcome', 'Welcome Email', 'Sent to new users after successful registration', 'Welcome to The Queer Guide!', 
'<h1>Welcome to The Queer Guide, {{display_name}}!</h1>
<p>We''re thrilled to have you join our community. The Queer Guide is your comprehensive resource for discovering LGBTQ+ friendly venues, events, and connecting with like-minded individuals.</p>
<h2>Get Started:</h2>
<ul>
  <li><strong>Complete your profile</strong> - Add more details to help others connect with you</li>
  <li><strong>Explore venues</strong> - Find queer-friendly bars, cafes, and organizations near you</li>
  <li><strong>Discover events</strong> - Stay updated on local LGBTQ+ events and gatherings</li>
  <li><strong>Join groups</strong> - Connect with communities that share your interests</li>
</ul>
<p>If you have any questions, feel free to reach out to our support team.</p>
<p>Welcome aboard!<br>The Queer Guide Team</p>',
'Welcome to The Queer Guide, {{display_name}}!

We''re thrilled to have you join our community. The Queer Guide is your comprehensive resource for discovering LGBTQ+ friendly venues, events, and connecting with like-minded individuals.

Get Started:
- Complete your profile - Add more details to help others connect with you
- Explore venues - Find queer-friendly bars, cafes, and organizations near you  
- Discover events - Stay updated on local LGBTQ+ events and gatherings
- Join groups - Connect with communities that share your interests

If you have any questions, feel free to reach out to our support team.

Welcome aboard!
The Queer Guide Team',
'[{"name": "display_name", "description": "User''s display name"}, {"name": "email", "description": "User''s email address"}]'::jsonb),

('email_verification', 'Email Verification', 'Sent when users need to verify their email address', 'Verify your email address', 
'<h1>Verify Your Email Address</h1>
<p>Hi {{display_name}},</p>
<p>Please click the link below to verify your email address and complete your account setup:</p>
<p><a href="{{verification_url}}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a></p>
<p>If the button doesn''t work, you can also copy and paste this link into your browser:</p>
<p>{{verification_url}}</p>
<p>This link will expire in 24 hours.</p>
<p>If you didn''t create an account with us, you can safely ignore this email.</p>
<p>Best regards,<br>The Queer Guide Team</p>',
'Hi {{display_name}},

Please click the link below to verify your email address and complete your account setup:

{{verification_url}}

This link will expire in 24 hours.

If you didn''t create an account with us, you can safely ignore this email.

Best regards,
The Queer Guide Team',
'[{"name": "display_name", "description": "User''s display name"}, {"name": "verification_url", "description": "Email verification URL"}]'::jsonb),

('password_reset', 'Password Reset', 'Sent when users request a password reset', 'Reset your password', 
'<h1>Reset Your Password</h1>
<p>Hi {{display_name}},</p>
<p>We received a request to reset your password for your Queer Guide account.</p>
<p>Click the link below to reset your password:</p>
<p><a href="{{reset_url}}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
<p>If the button doesn''t work, you can also copy and paste this link into your browser:</p>
<p>{{reset_url}}</p>
<p>This link will expire in 1 hour.</p>
<p>If you didn''t request a password reset, you can safely ignore this email.</p>
<p>Best regards,<br>The Queer Guide Team</p>',
'Hi {{display_name}},

We received a request to reset your password for your Queer Guide account.

Click the link below to reset your password:
{{reset_url}}

This link will expire in 1 hour.

If you didn''t request a password reset, you can safely ignore this email.

Best regards,
The Queer Guide Team',
'[{"name": "display_name", "description": "User''s display name"}, {"name": "reset_url", "description": "Password reset URL"}]'::jsonb),

('event_reminder', 'Event Reminder', 'Sent to remind users about upcoming events they''re attending', 'Event Reminder: {{event_title}}', 
'<h1>Don''t Forget: {{event_title}}</h1>
<p>Hi {{display_name}},</p>
<p>This is a friendly reminder about the upcoming event you''re attending:</p>
<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
  <h2>{{event_title}}</h2>
  <p><strong>Date:</strong> {{event_date}}</p>
  <p><strong>Time:</strong> {{event_time}}</p>
  <p><strong>Location:</strong> {{event_location}}</p>
  {{#if event_description}}
  <p><strong>Description:</strong> {{event_description}}</p>
  {{/if}}
</div>
<p>We''re excited to see you there!</p>
<p>Best regards,<br>The Queer Guide Team</p>',
'Don''t Forget: {{event_title}}

Hi {{display_name}},

This is a friendly reminder about the upcoming event you''re attending:

{{event_title}}
Date: {{event_date}}
Time: {{event_time}}
Location: {{event_location}}

{{#if event_description}}
Description: {{event_description}}
{{/if}}

We''re excited to see you there!

Best regards,
The Queer Guide Team',
'[{"name": "display_name", "description": "User''s display name"}, {"name": "event_title", "description": "Event title"}, {"name": "event_date", "description": "Event date"}, {"name": "event_time", "description": "Event time"}, {"name": "event_location", "description": "Event location"}, {"name": "event_description", "description": "Event description (optional)"}]'::jsonb),

('new_message', 'New Message Notification', 'Sent when users receive a new message', 'New message from {{sender_name}}', 
'<h1>You have a new message!</h1>
<p>Hi {{display_name}},</p>
<p>{{sender_name}} sent you a message:</p>
<div style="border-left: 4px solid #6366f1; padding-left: 16px; margin: 16px 0; font-style: italic;">
  {{message_preview}}
</div>
<p><a href="{{message_url}}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Message</a></p>
<p>Best regards,<br>The Queer Guide Team</p>',
'You have a new message!

Hi {{display_name}},

{{sender_name}} sent you a message:

"{{message_preview}}"

View your message at: {{message_url}}

Best regards,
The Queer Guide Team',
'[{"name": "display_name", "description": "Recipient''s display name"}, {"name": "sender_name", "description": "Message sender''s name"}, {"name": "message_preview", "description": "Preview of the message"}, {"name": "message_url", "description": "URL to view the message"}]'::jsonb);