require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'
module QueerGuide
  class RedirectApiError < StandardError
    attr_reader :status, :retry_after
    def initialize(status, message, retry_after = nil)
      super(message); @status, @retry_after = status, retry_after
    end
  end
  class RedirectsClient
    def initialize(token, base_url: 'https://queer.guide/api/redirects', timeout: 10, workspace_id: nil)
      uri = URI(base_url)
      raise ArgumentError, 'A server credential is required' if token.strip.empty? || token.match?(/[\r\n]/)
      safe = uri.scheme == 'https' || uri.scheme == 'http' && ['localhost','127.0.0.1','[::1]'].include?(uri.host)
      raise ArgumentError, 'Use HTTPS or a loopback development API' unless safe && !uri.userinfo && !uri.query && !uri.fragment
      raise ArgumentError, 'Timeout must be positive' unless timeout > 0
      raise ArgumentError, 'Provide a valid workspace ID' unless workspace_id.nil? || workspace_id.is_a?(String) && workspace_id.match?(/\A[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\z/i)
      @workspace_id = workspace_id&.downcase
      @token, @base, @timeout = token, base_url.sub(%r{/$}, ''), timeout
    end
    def get_session; request('GET','/session'); end
    def list_workspaces; request('GET','/workspaces'); end
    def list_workspace_information(kind, limit = 50, after = nil)
      request('GET','/workspace-information',nil,{kind:kind,limit:limit,after:after})
    end
    def list_integration_setups(limit = 50, after = nil)
      request('GET','/integrations',nil,{limit:limit,after:after})
    end
    def create_integration_setup(data); request('POST','/integrations',data); end
    def lookup_integration_setup(request_id); request('GET','/integrations',nil,{requestId:request_id}); end
    def revoke_integration_setup(id); request('DELETE','/integrations/'+URI.encode_www_form_component(id)); end
    def request(method, path, body = nil, query = {})
      raise ArgumentError, 'Invalid API path' unless path.match?(%r{\A/[a-zA-Z0-9_/-]+\z}) && !path.include?('//')
      uri = URI(@base + path)
      params = query.reject { |_,v| v.nil? }.map { |k,v| [k, (v.is_a?(Hash) || v.is_a?(Array)) ? JSON.generate(v) : v.to_s] }
      uri.query = URI.encode_www_form(params) unless params.empty?
      req = Net::HTTPGenericRequest.new(method, !body.nil?, true, uri.request_uri, {'Authorization'=>'Bearer '+@token,'Content-Type'=>'application/json'})
      req['X-Qg-Redirect-Workspace'] = @workspace_id if @workspace_id
      req.body = JSON.generate(body) unless body.nil?
      raw = ''; status = nil; retry_after = nil
      Net::HTTP.start(uri.host,uri.port,use_ssl: uri.scheme=='https',open_timeout:@timeout,read_timeout:@timeout) do |http|
        http.request(req) do |response|
          status, retry_after = response.code.to_i, response['Retry-After']
          response.read_body { |chunk| raw << chunk; raise 'API response exceeds 8 MiB' if raw.bytesize > 8*1024*1024 }
        end
      end
      begin; data = raw.empty? ? {} : JSON.parse(raw)
      rescue JSON::ParserError; raise 'API returned invalid JSON' if (200...300).include?(status); data = {}; end
      raise RedirectApiError.new(status,data['error'] || 'Redirect API request failed',retry_after) unless (200...300).include?(status)
      data
    end
    def get_policy(id); request('GET','/links/'+id+'/policy'); end
    def update_policy(id,data); request('PATCH','/links/'+id+'/policy',data); end
    def get_presentation(id); request('GET','/links/'+id+'/presentation'); end
    def update_presentation(id,data); request('PATCH','/links/'+id+'/presentation',data); end
    def upload_preview_image(id,image_base64); request('POST','/links/'+id+'/preview-image',{image:image_base64}); end
    def create_link(data); request('POST','/links',data); end
    def get_link(id); request('GET','/links/'+id); end
    def update_link(id,data); request('PATCH','/links/'+id,data); end
    def upsert_link(data); request('PUT','/links/upsert',data); end
    def delete_link(id); request('DELETE','/links/'+id); end
    def list_linked_domains(limit:100,cursor:nil); request('GET','/linked-domains',nil,{limit:limit,cursor:cursor}); end
    def get_qr_style(id); request('GET','/qr-styles/links/'+URI.encode_www_form_component(id)); end
    def create_qr_image(data); request('POST','/qr-images',data); end
    def list_qr_images(limit:100,cursor:nil); request('GET','/qr-images',nil,{limit:limit,cursor:cursor}); end
    def revoke_qr_image(id,version); request('DELETE','/qr-images/'+URI.encode_www_form_component(id),{version:version}); end
    def list_domain_choices(limit:100,cursor:nil); request('GET','/domain-choices',nil,{limit:limit,cursor:cursor}); end
    def list_inventory(filters={},limit:100,after:nil); request('GET','/inventory',nil,filters.merge(limit:limit,after:after)); end
    def get_inventory_metadata(id); request('GET','/inventory/metadata',nil,{id:id}); end
    def organize_inventory(operations); request('POST','/inventory/organization',operations); end
    def list_links(filters={},limit:100,cursor:nil); request('GET','/links',nil,{filters:filters,limit:limit,cursor:cursor}); end
    def count_links(filters={}); request('GET','/links/count',nil,{filters:filters}); end
    def bulk(operations); request('POST','/links/bulk',{operations:operations}); end
    def iterate_links(filters={})
      return enum_for(:iterate_links,filters) unless block_given?
      cursor = nil; seen = {}
      loop do
        page = list_links(filters,cursor:cursor); page['data'].each { |link| yield link }
        cursor = page['nextCursor']; break unless cursor
        raise 'Repeated pagination cursor' if seen[cursor]; seen[cursor]=true
      end
    end
    def track_lead(data); request('POST','/track/lead',data); end
    def track_sale(data); request('POST','/track/sale',data); end
    def analytics(filters={}); request('GET','/analytics',nil,{filters:filters}); end
    def events(filters={},**options); request('GET','/events',nil,options.merge(filters:filters)); end
    def get_customer(id); request('GET','/customers/profile',nil,{id:id}); end
    def update_customer(id,data); request('PATCH','/customers/profile',data.merge(customerExternalId:id)); end
    def clear_customer(id,version); request('DELETE','/customers/profile',{customerExternalId:id,version:version}); end
    def customer_journey(id,limit:50,cursor:nil); request('GET','/customers/journey',nil,{id:id,limit:limit,cursor:cursor}); end
    def create_report(data); request('POST','/reports',data); end
    def get_report(id); request('GET','/reports/'+URI.encode_www_form_component(id)); end
    def list_reports(limit:50,cursor:nil,view:nil); request('GET','/reports',nil,{limit:limit,cursor:cursor,view:view}); end
    def update_report(id,data); request('PATCH','/reports/'+URI.encode_www_form_component(id),data); end
    def delete_report(id); request('DELETE','/reports/'+URI.encode_www_form_component(id)); end
    def run_report(id); request('GET','/reports/'+URI.encode_www_form_component(id)+'/run'); end
    def create_report_share(id,data); request('POST','/reports/'+URI.encode_www_form_component(id)+'/shares',data); end
    def list_report_shares(id); request('GET','/reports/'+URI.encode_www_form_component(id)+'/shares'); end
    def revoke_report_share(id,share_id); request('DELETE','/reports/'+URI.encode_www_form_component(id)+'/shares/'+URI.encode_www_form_component(share_id)); end
    def read_public_report(data=nil); request(data.nil? ? 'GET' : 'POST','/public-report',data); end
    def get_resource(kind,id); request('GET','/'+kind+'/'+id); end
    def list_resources(kind,limit:100,cursor:nil); request('GET','/'+kind,nil,{limit:limit,cursor:cursor}); end
    def create_resource(kind,data); request('POST','/'+kind,data); end
    def update_resource(kind,id,data); request('PATCH','/'+kind+'/'+id,data); end
    def delete_resource(kind,id); request('DELETE','/'+kind+'/'+id); end
    def create_webhook(data); request('POST','/webhooks',data); end
    def get_webhook(id); request('GET','/webhooks'+'/'+URI.encode_www_form_component(id)); end
    def update_webhook(id,data); request('PATCH','/webhooks'+'/'+URI.encode_www_form_component(id),data); end
    def archive_webhook(id,version); request('DELETE','/webhooks'+'/'+URI.encode_www_form_component(id),{version:version}); end
    def rotate_webhook_secret(id,version); request('POST','/webhooks'+'/'+URI.encode_www_form_component(id)+'/rotate',{version:version}); end
    def test_webhook(id,version); request('POST','/webhooks'+'/'+URI.encode_www_form_component(id)+'/test',{version:version}); end
    def get_webhook_delivery(id,delivery_id); request('GET','/webhooks'+'/'+URI.encode_www_form_component(id)+'/deliveries/'+URI.encode_www_form_component(delivery_id)); end
    def replay_webhook_delivery(id,delivery_id,version); request('POST','/webhooks'+'/'+URI.encode_www_form_component(id)+'/deliveries/'+URI.encode_www_form_component(delivery_id)+'/replay',{version:version}); end
    def list_webhooks(limit:50,cursor:nil,archived:false); request('GET','/webhooks',nil,{limit:limit,cursor:cursor,archived:archived}); end
    def list_webhook_deliveries(id,limit:50,cursor:nil); request('GET','/webhooks'+'/'+URI.encode_www_form_component(id)+'/deliveries',nil,{limit:limit,cursor:cursor}); end
    def list_webhook_attempts(id,delivery_id,limit:50,cursor:nil); request('GET','/webhooks'+'/'+URI.encode_www_form_component(id)+'/deliveries'+'/'+URI.encode_www_form_component(delivery_id)+'/attempts',nil,{limit:limit,cursor:cursor}); end
    def get_password_branding(id); request('GET','/links/'+URI.encode_www_form_component(id)+'/password-branding'); end
    def update_password_branding(id,data); request('PATCH','/links/'+URI.encode_www_form_component(id)+'/password-branding',data); end
    def upload_password_logo(id,version,image); request('POST','/links/'+URI.encode_www_form_component(id)+'/password-branding/logo',{version:version,image:image}); end
  end

  def self.verify_webhook(secret,body,id,timestamp,signature,now:Time.now.to_i)
    secrets=secret.is_a?(Array) ? secret : [secret]
    return false unless body.is_a?(String) && body.bytesize<=32768 && (1..5).include?(secrets.length) && id.match?(/\A[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\z/i) && timestamp.match?(/\A[0-9]{1,12}\z/) && (now-timestamp.to_i).abs<=300 && signature.bytesize<=2048
    signatures=signature.split.select{|value|value.match?(/\Av1,[A-Za-z0-9+\/]{43}=\z/)}
    return false unless (1..20).include?(signatures.length)
    valid=false
    secrets.each do |value|
      return false unless value.is_a?(String)&&value.match?(/\Awhsec_[A-Za-z0-9+\/]{43}=\z/)
      key=Base64.strict_decode64(value[6..]);return false unless key.bytesize==32 && Base64.strict_encode64(key)==value[6..]
      expected=OpenSSL::HMAC.digest('SHA256',key,id+'.'+timestamp+'.'+body)
      signatures.each{|candidate|bytes=Base64.strict_decode64(candidate[3..]);difference=0;32.times{|index|difference|=expected.getbyte(index)^bytes.getbyte(index)};valid=(difference==0)||valid}
    end
    valid
  rescue ArgumentError
    false
  end
end
