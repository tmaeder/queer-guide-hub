"""Server SDK using Python's standard library. No automatic mutation retries."""
import json
import re
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urlsplit, urlencode, quote

class RedirectApiError(Exception):
    def __init__(self, status, message, retry_after=None):
        super().__init__(message)
        self.status, self.retry_after = status, retry_after

class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class RedirectsClient:
    def __init__(self, token, base_url='https://queer.guide/api/redirects', timeout=10, workspace_id=None):
        parsed = urlsplit(base_url)
        if not token.strip() or '\r' in token or '\n' in token:
            raise ValueError('A server credential is required')
        if parsed.username or parsed.password or parsed.query or parsed.fragment or not (parsed.scheme == 'https' or parsed.scheme == 'http' and parsed.hostname in ('localhost','127.0.0.1','::1')):
            raise ValueError('Use HTTPS or a loopback development API')
        if timeout <= 0: raise ValueError('Timeout must be positive')
        if workspace_id is not None and (not isinstance(workspace_id,str) or not re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}',workspace_id)): raise ValueError('Provide a valid workspace ID')
        self._workspace_id = workspace_id.lower() if workspace_id is not None else None
        self._token, self._base, self._timeout = token, base_url.rstrip('/'), timeout
        self._opener = build_opener(_NoRedirect())

    def get_session(self): return self.request('GET','/session')
    def list_workspaces(self): return self.request('GET','/workspaces')
    def list_workspace_information(self, kind, limit=50, after=None):
        return self.request('GET','/workspace-information',query={'kind':kind,'limit':limit,'after':after})

    def request(self, method, path, body=None, query=None):
        if not path.startswith('/') or '//' in path or any(not (c.isascii() and (c.isalnum() or c in '/_-')) for c in path):
            raise ValueError('Invalid API path')
        params = {k: json.dumps(v, ensure_ascii=False, separators=(',', ':')) if isinstance(v, (dict,list)) else str(v).lower() if isinstance(v,bool) else str(v) for k,v in (query or {}).items() if v is not None}
        url = self._base + path + ('?' + urlencode(params) if params else '')
        req = Request(url, data=None if body is None else json.dumps(body, ensure_ascii=False).encode(), method=method, headers={'Authorization':'Bearer '+self._token, 'Content-Type':'application/json', **({'X-Qg-Redirect-Workspace':self._workspace_id} if self._workspace_id else {})})
        try: response = self._opener.open(req, timeout=self._timeout)
        except HTTPError as error: response = error
        with response:
            raw = response.read(8*1024*1024+1)
            if len(raw)>8*1024*1024: raise ValueError('API response exceeds 8 MiB')
            try: data = json.loads(raw) if raw else {}
            except ValueError:
                if 200<=response.code<300: raise ValueError('API returned invalid JSON')
                data = {}
            if not 200<=response.code<300: raise RedirectApiError(response.code, data.get('error','Redirect API request failed'), response.headers.get('Retry-After'))
            return data

    def get_policy(self, link_id): return self.request('GET', '/links/' + link_id + '/policy')
    def update_policy(self, link_id, data): return self.request('PATCH', '/links/' + link_id + '/policy', data)
    def get_presentation(self, link_id): return self.request('GET','/links/'+link_id+'/presentation')
    def update_presentation(self, link_id, data): return self.request('PATCH','/links/'+link_id+'/presentation',data)
    def upload_preview_image(self, link_id, image_base64): return self.request('POST','/links/'+link_id+'/preview-image',{'image':image_base64})
    def create_link(self, data): return self.request('POST','/links',data)
    def get_link(self, link_id): return self.request('GET','/links/'+link_id)
    def update_link(self, link_id, data): return self.request('PATCH','/links/'+link_id,data)
    def upsert_link(self, data): return self.request('PUT','/links/upsert',data)
    def delete_link(self, link_id): return self.request('DELETE','/links/'+link_id)
    def list_linked_domains(self, limit=100, cursor=None): return self.request('GET','/linked-domains',query={'limit':limit,'cursor':cursor})
    def get_qr_style(self, link_id): return self.request('GET','/qr-styles/links/'+quote(link_id,safe=''))
    def create_qr_image(self, data): return self.request('POST','/qr-images',data)
    def list_qr_images(self, limit=100, cursor=None): return self.request('GET','/qr-images',query={'limit':limit,'cursor':cursor})
    def revoke_qr_image(self, image_id, version): return self.request('DELETE','/qr-images/'+quote(image_id,safe=''),{'version':version})
    def list_domain_choices(self, limit=100, cursor=None): return self.request('GET','/domain-choices',query={'limit':limit,'cursor':cursor})
    def list_inventory(self, filters=None, limit=100, after=None): return self.request('GET','/inventory',query={**(filters or {}),'limit':limit,'after':after})
    def get_inventory_metadata(self, record_id): return self.request('GET','/inventory/metadata',query={'id':record_id})
    def organize_inventory(self, operations): return self.request('POST','/inventory/organization',operations)
    def list_links(self, filters=None, limit=100, cursor=None): return self.request('GET','/links',query={'filters':filters or {},'limit':limit,'cursor':cursor})
    def count_links(self, filters=None): return self.request('GET','/links/count',query={'filters':filters or {}})
    def bulk(self, operations): return self.request('POST','/links/bulk',{'operations':operations})
    def iterate_links(self, filters=None):
        cursor, seen = None, set()
        while True:
            page = self.list_links(filters, cursor=cursor)
            yield from page['data']
            cursor = page.get('nextCursor')
            if not cursor: break
            if cursor in seen: raise ValueError('Repeated pagination cursor')
            seen.add(cursor)
    def track_lead(self, data): return self.request('POST','/track/lead',data)
    def track_sale(self, data): return self.request('POST','/track/sale',data)
    def analytics(self, filters=None): return self.request('GET','/analytics',query={'filters':filters or {}})
    def events(self, filters=None, **options): return self.request('GET','/events',query={**options,'filters':filters or {}})
    def get_customer(self, customer_id): return self.request('GET','/customers/profile',query={'id':customer_id})
    def update_customer(self, customer_id, data): return self.request('PATCH','/customers/profile',{**data,'customerExternalId':customer_id})
    def clear_customer(self, customer_id, version): return self.request('DELETE','/customers/profile',{'customerExternalId':customer_id,'version':version})
    def customer_journey(self, customer_id, limit=50, cursor=None): return self.request('GET','/customers/journey',query={'id':customer_id,'limit':limit,'cursor':cursor})
    def create_report(self, data): return self.request('POST','/reports',data)
    def get_report(self, report_id): return self.request('GET','/reports/'+quote(report_id,safe=''))
    def list_reports(self, limit=50, cursor=None, view=None): return self.request('GET','/reports',query={'limit':limit,'cursor':cursor,'view':view})
    def update_report(self, report_id, data): return self.request('PATCH','/reports/'+quote(report_id,safe=''),data)
    def delete_report(self, report_id): return self.request('DELETE','/reports/'+quote(report_id,safe=''))
    def run_report(self, report_id): return self.request('GET','/reports/'+quote(report_id,safe='')+'/run')
    def create_report_share(self, report_id, data): return self.request('POST','/reports/'+quote(report_id,safe='')+'/shares',data)
    def list_report_shares(self, report_id): return self.request('GET','/reports/'+quote(report_id,safe='')+'/shares')
    def revoke_report_share(self, report_id, share_id): return self.request('DELETE','/reports/'+quote(report_id,safe='')+'/shares/'+quote(share_id,safe=''))
    def read_public_report(self, data=None): return self.request('GET' if data is None else 'POST','/public-report',data)
    def get_resource(self, kind, resource_id): return self.request('GET','/'+kind+'/'+resource_id)
    def list_resources(self, kind, limit=100, cursor=None): return self.request('GET','/'+kind,query={'limit':limit,'cursor':cursor})
    def create_resource(self, kind, data): return self.request('POST','/'+kind,data)
    def update_resource(self, kind, resource_id, data): return self.request('PATCH','/'+kind+'/'+resource_id,data)
    def delete_resource(self, kind, resource_id): return self.request('DELETE','/'+kind+'/'+resource_id)
    def create_webhook(self, data): return self.request('POST','/webhooks',data)
    def get_webhook(self, webhook_id): return self.request('GET','/webhooks'+'/'+quote(webhook_id,safe=''))
    def update_webhook(self, webhook_id, data): return self.request('PATCH','/webhooks'+'/'+quote(webhook_id,safe=''),data)
    def archive_webhook(self, webhook_id, version): return self.request('DELETE','/webhooks'+'/'+quote(webhook_id,safe=''),{'version':version})
    def rotate_webhook_secret(self, webhook_id, version): return self.request('POST','/webhooks'+'/'+quote(webhook_id,safe='')+'/rotate',{'version':version})
    def test_webhook(self, webhook_id, version): return self.request('POST','/webhooks'+'/'+quote(webhook_id,safe='')+'/test',{'version':version})
    def get_webhook_delivery(self, webhook_id, delivery_id): return self.request('GET','/webhooks'+'/'+quote(webhook_id,safe='')+'/deliveries/'+quote(delivery_id,safe=''))
    def replay_webhook_delivery(self, webhook_id, delivery_id, version): return self.request('POST','/webhooks'+'/'+quote(webhook_id,safe='')+'/deliveries/'+quote(delivery_id,safe='')+'/replay',{'version':version})
    def list_webhooks(self, limit=50, cursor=None, archived=False): return self.request('GET','/webhooks',query={'limit':limit,'cursor':cursor,'archived':archived})
    def list_webhook_deliveries(self, webhook_id, limit=50, cursor=None): return self.request('GET','/webhooks'+ '/' + quote(webhook_id,safe='') + '/deliveries',query={'limit':limit,'cursor':cursor})
    def list_webhook_attempts(self, webhook_id, delivery_id, limit=50, cursor=None): return self.request('GET','/webhooks'+ '/' + quote(webhook_id,safe='') + '/deliveries'+'/'+quote(delivery_id,safe='')+'/attempts',query={'limit':limit,'cursor':cursor})

    def get_password_branding(self, link_id): return self.request('GET','/links/'+quote(link_id,safe='')+'/password-branding')
    def update_password_branding(self, link_id, data): return self.request('PATCH','/links/'+quote(link_id,safe='')+'/password-branding',data)
    def upload_password_logo(self, link_id, version, image): return self.request('POST','/links/'+quote(link_id,safe='')+'/password-branding/logo',{'version':version,'image':image})

def verify_webhook(secret, raw_body, webhook_id, timestamp, signature, now=None):
    """Verify original bytes before parsing; deduplicate webhook_id separately."""
    import base64, hashlib, hmac, re, time
    secrets = secret if isinstance(secret,list) else [secret]
    body = raw_body.encode('utf-8') if isinstance(raw_body,str) else raw_body
    now = int(time.time()) if now is None else now
    if not isinstance(body,bytes) or len(body)>32768 or not 1<=len(secrets)<=5 or not re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}',webhook_id) or not re.fullmatch(r'\d{1,12}',timestamp) or abs(now-int(timestamp))>300 or len(signature)>2048: return False
    signatures=[value[3:] for value in signature.split() if re.fullmatch(r'v1,[A-Za-z0-9+/]{43}=',value)]
    if not 1<=len(signatures)<=20:return False
    valid=False
    for value in secrets:
        if not isinstance(value,str) or not re.fullmatch(r'whsec_[A-Za-z0-9+/]{43}=',value):return False
        key=base64.b64decode(value[6:],validate=True)
        if len(key)!=32 or base64.b64encode(key).decode()!=value[6:]:return False
        expected=hmac.new(key,(webhook_id+'.'+timestamp+'.').encode()+body,hashlib.sha256).digest()
        for encoded in signatures:valid=hmac.compare_digest(expected,base64.b64decode(encoded,validate=True)) or valid
    return valid
