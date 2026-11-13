/** Shared policy contract for the admin editor and the public resolver. */
export interface LinkVariant { id: string; url: string; weight: number }
interface LinkExperiment { starts_at: string; ends_at: string; variants: LinkVariant[]; completed_target?: string }
export interface LinkPolicy {
  preview?: {title?:string;description?:string;image?:string;video?:string};
  cloaked?: boolean;
  track_conversions?: boolean;
  device_targets?: Partial<Record<'ios' | 'android', string>>;
  geo_targets?: Record<string, string>;
  experiment?: LinkExperiment;
  expires_at?: string;
  expired_target?: string;
}
export interface VariantPerformance { id: string; clicks: number; leads: number; sales: number }

export function validPublicTarget(target: string): boolean {
  if (typeof target !== 'string' || !target.trim() || target.length > 8192 || /[\r\n\\]/.test(target)) return false;
  const raw = target.trim();
  if (raw.startsWith('/')) return !raw.startsWith('//') && !raw.split(/[?#]/)[0].includes('..');
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.') || /(?:^|\.)(localhost|local|internal|home|test|invalid|example)$/.test(host)) return false;
    if (host.startsWith('[')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const ip = host.split('.').map(Number), [a,b] = ip;
      if (ip.some((part) => part < 0 || part > 255) || a === 0 || a === 10 || a === 127 || a >= 224 ||
        a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return false;
    }
    return true;
  } catch { return false; }
}

export const LINK_POLICY_FIELDS = ['preview','cloaked','track_conversions','device_targets','geo_targets','experiment','expires_at','expired_target'];
export function policyErrors(policy: LinkPolicy): string[] {
  const errors: string[] = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return ['Policy must be an object'];
  const allowed = LINK_POLICY_FIELDS;
  if (Object.keys(policy).some((key) => !allowed.includes(key))) errors.push('Unknown policy setting');
  if(policy.cloaked!==undefined&&typeof policy.cloaked!=='boolean')errors.push('Invalid cloaking setting');
  if(policy.preview!==undefined){
   const preview=policy.preview;
   if(!preview||typeof preview!=='object'||Array.isArray(preview))errors.push('Invalid link preview');
   else{
    if(Object.keys(preview).some(key=>!['title','description','image','video'].includes(key)))errors.push('Unknown preview field');
    for(const [key,limit] of [['title',120],['description',240]] as const)if(preview[key]!==undefined&&(typeof preview[key]!=='string'||preview[key]!.length>limit))errors.push('Preview '+key+' exceeds '+limit+' characters');
    for(const key of ['image','video'] as const)if(preview[key]!==undefined&&(!validPublicTarget(preview[key]!)||!preview[key]!.startsWith('https://')))errors.push('Preview '+key+' must be a public HTTPS URL');
   }
  }
  if (policy.track_conversions !== undefined && typeof policy.track_conversions !== 'boolean') errors.push('Conversion tracking must be enabled or disabled');
  for (const [kind, targets] of [['device',policy.device_targets], ['country',policy.geo_targets]] as const) {
    if (targets===undefined) continue;
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) { errors.push('Invalid ' + kind + ' rules'); continue; }
    for (const [key, target] of Object.entries(targets)) {
      if (kind === 'device' ? !['ios','android'].includes(key) : !/^[A-Z]{2}$/.test(key)) errors.push('Invalid ' + kind + ' ' + key);
      if (!validPublicTarget(target)) errors.push('Invalid destination for ' + key);
      if(policy.cloaked&&typeof target==='string'&&target.toLowerCase().startsWith('http:'))errors.push('Framed destinations require HTTPS');
    }
  }
  if (policy.expires_at !== undefined && (typeof policy.expires_at !== 'string' || !Number.isFinite(Date.parse(policy.expires_at)))) errors.push('Invalid expiration date');
  if (policy.expired_target !== undefined && !validPublicTarget(policy.expired_target)) errors.push('Invalid expiration destination');
  const experiment = policy.experiment;
  if (experiment !== undefined) {
    if(!experiment || typeof experiment!=='object' || Array.isArray(experiment)) return [...errors,'Invalid A/B experiment'];
    if(Object.keys(experiment).some(key=>!['starts_at','ends_at','variants','completed_target'].includes(key))) errors.push('Unknown A/B setting');
    if (!Array.isArray(experiment.variants) || experiment.variants.length < 2 || experiment.variants.length > 5) errors.push('An A/B test needs 2–5 destinations');
    else if(experiment.variants.some(variant=>!variant||typeof variant!=='object'||Array.isArray(variant))) errors.push('Invalid A/B destination');
    else {
      if (new Set(experiment.variants.map((variant) => variant.id)).size !== experiment.variants.length) errors.push('Variant IDs must be unique');
      if (experiment.variants.reduce((sum, variant) => sum + (typeof variant.weight==='number'?variant.weight:NaN), 0) !== 100) errors.push('Traffic weights must total 100%');
      for (const variant of experiment.variants) {
        if(Object.keys(variant).some(key=>!['id','url','weight'].includes(key)))errors.push('Unknown A/B destination field');
        if (typeof variant.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(variant.id) || !validPublicTarget(variant.url)) errors.push('Invalid A/B destination');
        if(policy.cloaked&&typeof variant.url==='string'&&variant.url.toLowerCase().startsWith('http:'))errors.push('Framed destinations require HTTPS');
        if (!Number.isInteger(variant.weight) || variant.weight < 10 || variant.weight > 90) errors.push('Each A/B destination must receive at least 10%');
      }
    }
    const duration = typeof experiment.ends_at==='string'&&typeof experiment.starts_at==='string'?Date.parse(experiment.ends_at)-Date.parse(experiment.starts_at):NaN;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 42 * 86400000) errors.push('A/B tests must end within 6 weeks of their start');
    if (experiment.completed_target !== undefined && !validPublicTarget(experiment.completed_target)) errors.push('Invalid A/B winner destination');
  }
  return errors;
}

export function deviceFromAgent(agent: string): 'ios' | 'android' | 'desktop' {
  if (/iPhone|iPad|iPod/.test(agent) || /Macintosh/.test(agent) && /Mobile/.test(agent)) return 'ios';
  return /Android/i.test(agent) ? 'android' : 'desktop';
}

export function experimentWinner(variants: LinkVariant[], stats: VariantPerformance[]): string {
  const byId = new Map(stats.map((stat) => [stat.id, stat]));
  const hasSales = stats.some((stat) => stat.sales > 0);
  return [...variants].sort((a,b) => {
    const left = byId.get(a.id) ?? {clicks:0,leads:0,sales:0};
    const right = byId.get(b.id) ?? {clicks:0,leads:0,sales:0};
    const l = hasSales ? left.sales : left.leads, r = hasSales ? right.sales : right.leads;
    return r-l || (right.clicks ? r/right.clicks : 0) - (left.clicks ? l/left.clicks : 0) || right.clicks-left.clicks;
  })[0].url;
}

export function chooseLinkTarget(fallback: string, policy: LinkPolicy, context: { device: string; country?: string | null; bucket: number; now?: number }, stats: VariantPerformance[] = []) {
  const now = context.now ?? Date.now();
  if (policy.expires_at && Date.parse(policy.expires_at) <= now) return { target: policy.expired_target ?? null, expired: true, variantId: null };
  const deviceTarget = policy.device_targets?.[context.device as 'ios'|'android'];
  if (deviceTarget) return {target:deviceTarget,expired:false,variantId:null};
  const countryTarget = context.country ? policy.geo_targets?.[context.country.toUpperCase()] : null;
  if (countryTarget) return {target:countryTarget,expired:false,variantId:null};
  const experiment = policy.experiment;
  if (experiment) {
    if (experiment.completed_target) return {target:experiment.completed_target,expired:false,variantId:null};
    if (now >= Date.parse(experiment.ends_at)) return {target:experimentWinner(experiment.variants, stats),expired:false,variantId:null};
    if (now >= Date.parse(experiment.starts_at)) {
      let threshold = 0;
      for (const variant of experiment.variants) {
        threshold += variant.weight;
        if (context.bucket < threshold) return {target:variant.url,expired:false,variantId:variant.id};
      }
    }
  }
  return {target:fallback,expired:false,variantId:null};
}

export interface PasswordHash { algorithm: 'PBKDF2-SHA256'; iterations: number; salt: string; hash: string }
const PASSWORD_ITERATIONS = 600000;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), (letter) => letter.charCodeAt(0));
async function passwordBits(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt: salt as BufferSource,iterations:PASSWORD_ITERATIONS,hash:'SHA-256'}, key, 256));
}
export async function hashLinkPassword(password: string): Promise<PasswordHash> {
  if (password.length < 1 || password.length > 256) throw new Error('Password must be 1–256 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {algorithm:'PBKDF2-SHA256',iterations:PASSWORD_ITERATIONS,salt:encode(salt),hash:encode(await passwordBits(password,salt))};
}
export async function verifyLinkPassword(password: string, stored: PasswordHash): Promise<boolean> {
  if (!password || password.length > 256 || stored.algorithm !== 'PBKDF2-SHA256' || stored.iterations !== PASSWORD_ITERATIONS) return false;
  try {
    const salt=decode(stored.salt), expected=decode(stored.hash);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await passwordBits(password,salt);
    let difference = 0;
    for (let index=0; index<expected.length; index++) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch { return false; }
}
