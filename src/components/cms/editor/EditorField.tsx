import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ProfessionAutocomplete } from '@/components/ui/profession-autocomplete';
import { CountryAutocomplete } from '@/components/ui/country-autocomplete';
import { ImageUpload } from '@/components/ui/image-upload';
import type { FieldConfig } from './fieldGroups';

interface EditorFieldProps {
  field: FieldConfig;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

export function EditorField({ field, value, onChange }: EditorFieldProps) {
  const { key, label, type, required, readonly, options, icon } = field;

  if (readonly) {
    return (
      <div key={key} className="flex flex-col gap-2">
        <Label>
          {icon}
          {label}
          <Badge variant="secondary">Read-only</Badge>
        </Label>
        <div className="px-3 py-2 bg-accent rounded-element text-sm">
          {value != null ? String(value) : 'N/A'}
        </div>
      </div>
    );
  }

  switch (type) {
    case 'text':
      if (key === 'profession') {
        return (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={key}>
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <ProfessionAutocomplete
              id={key}
              value={(value as string) || ''}
              onValueChange={(v) => onChange(key, v)}
              placeholder="Select or type a profession..."
              required={required}
            />
          </div>
        );
      }
      if (key === 'nationality') {
        return (
          <div key={key} className="flex flex-col gap-2">
            <Label htmlFor={key}>
              {icon}
              {label}
              {required && <span className="text-destructive">*</span>}
            </Label>
            <CountryAutocomplete
              id={key}
              value={(value as string) || ''}
              onValueChange={(v) => onChange(key, v)}
              placeholder="Select a country..."
              required={required}
            />
          </div>
        );
      }
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={key}
            value={(value as string) || ''}
            onChange={(e) => onChange(key, e.target.value)}
            required={required}
          />
        </div>
      );

    case 'textarea':
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id={key}
            value={(value as string) || ''}
            onChange={(e) => onChange(key, e.target.value)}
            className="min-h-24"
            required={required}
          />
        </div>
      );

    case 'number':
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={key}
            type="number"
            value={value !== null && value !== undefined ? (value as number) : ''}
            onChange={(e) => onChange(key, e.target.value ? Number(e.target.value) : null)}
            required={required}
          />
        </div>
      );

    case 'email':
    case 'tel':
    case 'url':
      if (type === 'url' && (key === 'image_url' || key.includes('image'))) {
        return (
          <div key={key} className="flex flex-col gap-2">
            <ImageUpload
              id={key}
              value={(value as string) || ''}
              onValueChange={(v) => onChange(key, v)}
              label={label}
              required={required}
              maxSize={5}
            />
          </div>
        );
      }
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={key}
            type={type}
            value={(value as string) || ''}
            onChange={(e) => onChange(key, e.target.value)}
            required={required}
          />
        </div>
      );

    case 'date':
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={key}
            type="date"
            value={value ? (value instanceof Date ? value.toISOString().split('T')[0] : new Date(value as string).toISOString().split('T')[0]) : ''}
            onChange={(e) => onChange(key, e.target.value ? new Date(e.target.value).toISOString() : null)}
            required={required}
          />
        </div>
      );

    case 'datetime':
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={key}
            type="datetime-local"
            value={value ? (value instanceof Date ? value.toISOString().slice(0, 16) : new Date(value as string).toISOString().slice(0, 16)) : ''}
            onChange={(e) => onChange(key, e.target.value ? new Date(e.target.value).toISOString() : null)}
            required={required}
          />
        </div>
      );

    case 'boolean':
      return (
        <div key={key} className="flex items-center gap-2">
          <Switch
            id={key}
            checked={(value as boolean) || false}
            onCheckedChange={(checked) => onChange(key, checked)}
          />
          <Label htmlFor={key}>
            {icon}
            {label}
          </Label>
        </div>
      );

    case 'select':
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Select value={(value as string) || ''} onValueChange={(v) => onChange(key, v)}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options?.filter((option: string) => option && option.trim() !== '').map((option: string) => (
                <SelectItem key={option} value={option}>
                  {option.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'array': {
      let displayValue = '';
      if (value) {
        if (Array.isArray(value)) {
          displayValue = value.join(', ');
        } else if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            displayValue = Array.isArray(parsed) ? parsed.join(', ') : value;
          } catch {
            displayValue = value;
          }
        } else if (typeof value === 'object') {
          displayValue = Object.values(value).join(', ');
        }
      }
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id={key}
            value={displayValue}
            onChange={(e) => {
              const items = e.target.value.split(',').map(item => item.trim()).filter(Boolean);
              onChange(key, items);
            }}
            placeholder="Enter comma-separated values"
          />
          {displayValue && (
            <div className="text-xs text-muted-foreground">
              Current: {displayValue.split(',').length} item(s)
            </div>
          )}
        </div>
      );
    }

    case 'json': {
      let jsonDisplayValue = '';
      if (value) {
        if (typeof value === 'object') {
          jsonDisplayValue = JSON.stringify(value, null, 2);
        } else if (typeof value === 'string') {
          try {
            jsonDisplayValue = JSON.stringify(JSON.parse(value), null, 2);
          } catch {
            jsonDisplayValue = value;
          }
        } else {
          jsonDisplayValue = String(value);
        }
      }
      return (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={key}>
            {icon}
            {label}
            {required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id={key}
            value={jsonDisplayValue}
            onChange={(e) => {
              try {
                onChange(key, JSON.parse(e.target.value));
              } catch {
                onChange(key, e.target.value);
              }
            }}
            placeholder="Enter JSON data"
          />
          {jsonDisplayValue && (
            <div className="text-xs text-muted-foreground">
              {jsonDisplayValue.length > 100 ? `${jsonDisplayValue.length} characters` : 'Valid JSON'}
            </div>
          )}
        </div>
      );
    }

    default:
      // Auto-detect type from value
      if (typeof value === 'boolean') return <EditorField field={{ ...field, type: 'boolean' }} value={value} onChange={onChange} />;
      if (typeof value === 'number') return <EditorField field={{ ...field, type: 'number' }} value={value} onChange={onChange} />;
      if (Array.isArray(value)) return <EditorField field={{ ...field, type: 'array' }} value={value} onChange={onChange} />;
      if (typeof value === 'object' && value !== null) return <EditorField field={{ ...field, type: 'json' }} value={value} onChange={onChange} />;
      if (key.includes('_at') || key.includes('date')) return <EditorField field={{ ...field, type: key.includes('_at') ? 'datetime' : 'date' }} value={value} onChange={onChange} />;
      if (key.includes('email')) return <EditorField field={{ ...field, type: 'email' }} value={value} onChange={onChange} />;
      if (key.includes('url') || key.includes('website')) return <EditorField field={{ ...field, type: 'url' }} value={value} onChange={onChange} />;
      if (key.includes('phone')) return <EditorField field={{ ...field, type: 'tel' }} value={value} onChange={onChange} />;
      if (typeof value === 'string' && value.length > 100) return <EditorField field={{ ...field, type: 'textarea' }} value={value} onChange={onChange} />;
      return <EditorField field={{ ...field, type: 'text' }} value={value} onChange={onChange} />;
  }
}
