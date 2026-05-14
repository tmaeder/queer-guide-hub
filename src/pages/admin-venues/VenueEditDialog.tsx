import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LocationAutocomplete, type AddressComponents } from '@/components/ui/location-autocomplete';
import { VenueImageUpload } from '@/components/venues/VenueImageUpload';
import { venueCategories, commonAmenities, type VenueFormData } from './types';

interface VenueEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: VenueFormData;
  setFormData: React.Dispatch<React.SetStateAction<VenueFormData>>;
  isEditing: boolean;
  isEnriching: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onEnrich: () => void;
  onAddressComponents: (components: AddressComponents | undefined, coordinates?: { lat: number; lng: number }) => void;
}

export function VenueEditDialog({
  open, onOpenChange, formData, setFormData, isEditing,
  isEnriching, onSubmit, onEnrich, onAddressComponents,
}: VenueEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Venue' : 'Add New Venue'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          {/* Basic Info */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Basic Information</h3>
              <Button
                type="button"
                variant="outline"
                onClick={onEnrich}
                disabled={isEnriching || !formData.name.trim()}
                style={{ fontSize: '0.875rem' }}
              >
                {isEnriching ? 'Enriching...' : 'Enrich Venue'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Venue Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {venueCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          {/* Location */}
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">Location</h3>
            <LocationAutocomplete
              value={formData.address}
              onChange={(address, coordinates, components) => {
                setFormData((prev) => ({
                  ...prev,
                  address,
                  latitude: coordinates ? coordinates.lat.toString() : '',
                  longitude: coordinates ? coordinates.lng.toString() : '',
                }));
                if (components) onAddressComponents(components, coordinates);
              }}
              required
              placeholder="Enter full address"
            />
            {formData.latitude && formData.longitude && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Latitude</Label>
                  <Input value={formData.latitude} readOnly style={{ backgroundColor: 'var(--muted)' }} />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input value={formData.longitude} readOnly style={{ backgroundColor: 'var(--muted)' }} />
                </div>
              </div>
            )}
            <details>
              <summary className="text-sm text-muted-foreground cursor-pointer">Manual location override</summary>
              <div className="grid grid-cols-4 gap-4 pt-2">
                <div>
                  <Label>City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={formData.state} onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))} />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={formData.country} onChange={(e) => setFormData((prev) => ({ ...prev, country: e.target.value }))} />
                </div>
                <div>
                  <Label>Postal Code</Label>
                  <Input value={formData.postal_code} onChange={(e) => setFormData((prev) => ({ ...prev, postal_code: e.target.value }))} />
                </div>
              </div>
            </details>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">Contact</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={formData.website} onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))} />
              </div>
              <div>
                <Label>Instagram</Label>
                <Input value={formData.instagram} onChange={(e) => setFormData((prev) => ({ ...prev, instagram: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">Settings</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Price Range</Label>
                <Select value={formData.price_range} onValueChange={(v) => setFormData((prev) => ({ ...prev, price_range: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">$ - Budget</SelectItem>
                    <SelectItem value="2">$$ - Moderate</SelectItem>
                    <SelectItem value="3">$$$ - Expensive</SelectItem>
                    <SelectItem value="4">$$$$ - Very Expensive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_featured" checked={formData.is_featured} onCheckedChange={(c) => setFormData((prev) => ({ ...prev, is_featured: c as boolean }))} />
                <Label htmlFor="is_featured">Featured</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="verified" checked={formData.verified} onCheckedChange={(c) => setFormData((prev) => ({ ...prev, verified: c as boolean }))} />
                <Label htmlFor="verified">Verified</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="is_organizer" checked={formData.is_organizer} onCheckedChange={(c) => setFormData((prev) => ({ ...prev, is_organizer: c as boolean }))} />
                <Label htmlFor="is_organizer">Organizer</Label>
              </div>
            </div>
          </div>

          {formData.is_organizer && (
            <div className="flex flex-col gap-4">
              <h3 className="font-semibold">Organizer Handles</h3>
              <div className="grid grid-cols-3 gap-4">
                {["instagram", "telegram", "bluesky", "x", "website"].map((handle) => (
                  <div key={handle}>
                    <Label>{handle.charAt(0).toUpperCase() + handle.slice(1)}</Label>
                    <Input
                      placeholder={handle === "website" ? "https://..." : "@handle"}
                      value={formData.organizer_handles[handle] || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          organizer_handles: { ...prev.organizer_handles, [handle]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags & Amenities */}
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">Tags &amp; Amenities</h3>
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1 mb-2 mt-1">
                {formData.tags.map((tag, i) => (
                  <Badge key={i} variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {tag}
                    <button type="button" onClick={() => setFormData((prev) => ({ ...prev, tags: prev.tags.filter((_, idx) => idx !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>&times;</button>
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Add tags (Enter)"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = e.currentTarget.value.trim();
                    if (v && !formData.tags.includes(v)) {
                      setFormData((prev) => ({ ...prev, tags: [...prev.tags, v] }));
                      e.currentTarget.value = '';
                    }
                  }
                }}
              />
            </div>
            <div>
              <Label>Amenities</Label>
              <div className="flex flex-wrap gap-1 mb-2 mt-1">
                {formData.amenities.map((a, i) => (
                  <Badge key={i} variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {a}
                    <button type="button" onClick={() => setFormData((prev) => ({ ...prev, amenities: prev.amenities.filter((_, idx) => idx !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>&times;</button>
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Add amenities (Enter)"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = e.currentTarget.value.trim();
                    if (v && !formData.amenities.includes(v)) {
                      setFormData((prev) => ({ ...prev, amenities: [...prev.amenities, v] }));
                      e.currentTarget.value = '';
                    }
                  }
                }}
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {commonAmenities.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    variant="outline"
                    size="sm"
                    style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                    disabled={formData.amenities.includes(a)}
                    onClick={() => {
                      if (!formData.amenities.includes(a))
                        setFormData((prev) => ({ ...prev, amenities: [...prev.amenities, a] }));
                    }}
                  >
                    {a}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <VenueImageUpload
            images={formData.images}
            onChange={(images) => setFormData((prev) => ({ ...prev, images }))}
            maxImages={8}
          />

          <Button type="submit" style={{ width: '100%' }}>
            {isEditing ? 'Update Venue' : 'Add Venue'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
