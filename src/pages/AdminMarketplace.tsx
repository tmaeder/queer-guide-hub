import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { useMarketplace } from "@/hooks/useMarketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ArrowLeft,
  ShoppingBag,
  DollarSign,
  Eye,
  Star,
  Download,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ExportExcelButton } from "@/components/admin/ExportExcelButton";
import { exportToExcel, fetchAllRows, formatDateTime, formatBoolean, generateFilename, type ExportColumnDef } from "@/utils/excelExport";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function AdminMarketplace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canManageContent, loading: rolesLoading } = useAdminRoles();
  const { listings, loading, createListing } = useMarketplace();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filteredListings, setFilteredListings] = useState(listings);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAwinImportOpen, setIsAwinImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importParams, setImportParams] = useState({
    csvUrl: "",
    maxProducts: 1000,
    skipRows: 0,
    batchSize: 100
  });
  const [editingListing, setEditingListing] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    business_name: "",
    description: "",
    category: "",
    subcategory: "",
    business_type: "",
    price: "",
    price_type: "fixed",
    currency: "USD",
    location: "",
    website: "",
    contact_phone: "",
    contact_email: "",
    shipping_available: false,
    shipping_info: "",
    featured: false,
    tags: [] as string[]
  });

  const categories = [
    "food_beverage", "retail", "services", "health_wellness",
    "entertainment", "technology", "fashion", "home_garden", "other"
  ];

  const businessTypes = [
    "restaurant", "retail_store", "service_provider", "online_business",
    "consultant", "freelancer", "startup", "established_business", "other"
  ];

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!rolesLoading && !canManageContent()) {
      navigate("/");
      return;
    }
  }, [user, rolesLoading, canManageContent]);

  useEffect(() => {
    filterListings();
  }, [listings, searchQuery, selectedCategory]);

  const filterListings = () => {
    let filtered = listings;

    if (searchQuery) {
      filtered = filtered.filter(listing =>
        listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== "all") {
      filtered = filtered.filter(listing => listing.category === selectedCategory);
    }

    setFilteredListings(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const listingData = {
        ...formData,
        price: formData.price ? parseFloat(formData.price) : null,
        created_by: user?.id
      };

      const { error } = await createListing(listingData);

      if (error) throw new Error(error);

      toast({
        title: "Success",
        description: "Listing created successfully"
      });

      resetForm();
      setIsCreateDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create listing",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      business_name: "",
      description: "",
      category: "",
      subcategory: "",
      business_type: "",
      price: "",
      price_type: "fixed",
      currency: "USD",
      location: "",
      website: "",
      contact_phone: "",
      contact_email: "",
      shipping_available: false,
      shipping_info: "",
      featured: false,
      tags: []
    });
    setEditingListing(null);
  };

  const handleAwinImport = async () => {
    setIsImporting(true);
    try {
      console.log("Starting Awin import with params:", importParams);

      const { data, error } = await supabase.functions.invoke('import-awin-products', {
        body: importParams
      });

      if (error) {
        console.error("Awin import error:", error);
        throw new Error(error.message || "Failed to import from Awin");
      }

      toast({
        title: "Import Successful",
        description: `Imported ${data.imported} products from Awin (${data.total} total available)`
      });

      setIsAwinImportOpen(false);
      // Refresh listings
      window.location.reload();

    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import products from Awin",
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  if (rolesLoading || loading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
        <Box sx={{ textAlign: 'center' }}>Loading...</Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outline" onClick={() => navigate("/admin")}>
            <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
            Back to Dashboard
          </Button>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>Marketplace Management</Typography>
            <Typography sx={{ color: 'var(--muted-foreground)' }}>Manage marketplace listings and products</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ExportExcelButton onExport={async () => {
            const columns: ExportColumnDef<any>[] = [
              { header: 'Title', accessor: r => r.title },
              { header: 'Business Name', accessor: r => r.business_name },
              { header: 'Category', accessor: r => r.category },
              { header: 'Business Type', accessor: r => r.business_type },
              { header: 'Price', accessor: r => r.price },
              { header: 'Currency', accessor: r => r.currency },
              { header: 'Location', accessor: r => r.location },
              { header: 'Contact Email', accessor: r => r.contact_email },
              { header: 'Contact Phone', accessor: r => r.contact_phone },
              { header: 'Website', accessor: r => r.website },
              { header: 'Featured', accessor: r => formatBoolean(r.featured) },
              { header: 'Created At', accessor: r => formatDateTime(r.created_at) },
            ];
            const allData = await fetchAllRows('marketplace_listings', '*', { column: 'title', ascending: true });
            await exportToExcel(allData, columns, generateFilename('marketplace'));
          }} />
          <Dialog open={isAwinImportOpen} onOpenChange={setIsAwinImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                Import from Awin
              </Button>
            </DialogTrigger>
            <DialogContent style={{ maxWidth: 672 }}>
              <DialogHeader>
                <DialogTitle>Import Products from Awin CSV Feed</DialogTitle>
              </DialogHeader>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  Import products from Awin CSV data feeds. Leave CSV URL blank to use the default feed with your API credentials.
                </Typography>

                <Box>
                  <Label htmlFor="awin-csv-url">Custom CSV Feed URL (Optional)</Label>
                  <Input
                    id="awin-csv-url"
                    placeholder="https://productdata.awin.com/datafeed/download/..."
                    value={importParams.csvUrl}
                    onChange={(e) => setImportParams(prev => ({ ...prev, csvUrl: e.target.value }))}
                  />
                  <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', mt: 0.5 }}>
                    Leave blank to use default Awin CSV feed with your API credentials
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label htmlFor="awin-max-products">Max Products</Label>
                    <Input
                      id="awin-max-products"
                      type="number"
                      min="1"
                      max="10000"
                      value={importParams.maxProducts}
                      onChange={(e) => setImportParams(prev => ({ ...prev, maxProducts: parseInt(e.target.value) || 1000 }))}
                    />
                  </Box>
                  <Box>
                    <Label htmlFor="awin-skip-rows">Skip Rows</Label>
                    <Input
                      id="awin-skip-rows"
                      type="number"
                      min="0"
                      value={importParams.skipRows}
                      onChange={(e) => setImportParams(prev => ({ ...prev, skipRows: parseInt(e.target.value) || 0 }))}
                    />
                  </Box>
                  <Box>
                    <Label htmlFor="awin-batch-size">Batch Size</Label>
                    <Input
                      id="awin-batch-size"
                      type="number"
                      min="10"
                      max="500"
                      value={importParams.batchSize}
                      onChange={(e) => setImportParams(prev => ({ ...prev, batchSize: parseInt(e.target.value) || 100 }))}
                    />
                  </Box>
                </Box>

                <Box sx={{ bgcolor: 'var(--muted)', p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography sx={{ fontWeight: 500 }}>Import Process:</Typography>
                  <Box component="ul" sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <li>• Downloads and decompresses gzipped CSV feed</li>
                    <li>• Processes products in batches to avoid timeouts</li>
                    <li>• Maps Awin categories to marketplace categories</li>
                    <li>• Preserves all original Awin metadata</li>
                    <li>• Supports multiple product images</li>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 2 }}>
                  <Button
                    variant="outline"
                    onClick={() => setIsAwinImportOpen(false)}
                    disabled={isImporting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAwinImport}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw style={{ height: 16, width: 16, marginRight: 8, animation: 'spin 1s linear infinite' }} />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Download style={{ height: 16, width: 16, marginRight: 8 }} />
                        Import CSV Feed
                      </>
                    )}
                  </Button>
                </Box>
              </Box>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus style={{ height: 16, width: 16, marginRight: 8 }} />
                Create Listing
              </Button>
            </DialogTrigger>
          <DialogContent style={{ maxWidth: 896, maxHeight: '90vh', overflowY: 'auto' }}>
            <DialogHeader>
              <DialogTitle>Create New Listing</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Basic Info */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>Basic Information</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label htmlFor="title">Listing Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </Box>
                  <Box>
                    <Label htmlFor="business_name">Business Name</Label>
                    <Input
                      id="business_name"
                      value={formData.business_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_name: e.target.value }))}
                      required
                    />
                  </Box>
                </Box>

                <Box>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(category => (
                          <SelectItem key={category} value={category}>
                            {category.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Box>
                  <Box>
                    <Label htmlFor="subcategory">Subcategory</Label>
                    <Input
                      id="subcategory"
                      value={formData.subcategory}
                      onChange={(e) => setFormData(prev => ({ ...prev, subcategory: e.target.value }))}
                      placeholder="Optional"
                    />
                  </Box>
                  <Box>
                    <Label htmlFor="business_type">Business Type</Label>
                    <Select
                      value={formData.business_type}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, business_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {businessTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Box>
                </Box>
              </Box>

              {/* Pricing */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>Pricing</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label htmlFor="price">Price</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                    />
                  </Box>
                  <Box>
                    <Label htmlFor="price_type">Price Type</Label>
                    <Select
                      value={formData.price_type}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, price_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Price</SelectItem>
                        <SelectItem value="hourly">Per Hour</SelectItem>
                        <SelectItem value="daily">Per Day</SelectItem>
                        <SelectItem value="monthly">Per Month</SelectItem>
                        <SelectItem value="negotiable">Negotiable</SelectItem>
                      </SelectContent>
                    </Select>
                  </Box>
                  <Box>
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                      </SelectContent>
                    </Select>
                  </Box>
                </Box>
              </Box>

              {/* Contact & Location */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>Contact & Location</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label htmlFor="contact_phone">Phone</Label>
                    <Input
                      id="contact_phone"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    />
                  </Box>
                  <Box>
                    <Label htmlFor="contact_email">Email</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                    />
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </Box>
                  <Box>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="City, State"
                    />
                  </Box>
                </Box>
              </Box>

              {/* Shipping & Settings */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>Shipping & Settings</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Checkbox
                    id="shipping_available"
                    checked={formData.shipping_available}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, shipping_available: checked as boolean }))}
                  />
                  <Label htmlFor="shipping_available">Shipping Available</Label>
                </Box>

                {formData.shipping_available && (
                  <Box>
                    <Label htmlFor="shipping_info">Shipping Information</Label>
                    <Textarea
                      id="shipping_info"
                      value={formData.shipping_info}
                      onChange={(e) => setFormData(prev => ({ ...prev, shipping_info: e.target.value }))}
                      rows={2}
                      placeholder="Shipping details, costs, timeframes, etc."
                    />
                  </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox
                    id="featured"
                    checked={formData.featured}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, featured: checked as boolean }))}
                  />
                  <Label htmlFor="featured">Featured Listing</Label>
                </Box>
              </Box>

              <Button type="submit" style={{ width: '100%' }}>
                Create Listing
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </Box>
      </Box>

      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <CardContent style={{ padding: 24 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Input
                  placeholder="Search listings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 40 }}
                />
              </Box>
            </Box>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger style={{ width: 192 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        </CardContent>
      </Card>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3, mb: 4 }}>
        <Card>
          <CardContent style={{ padding: 24 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShoppingBag style={{ height: 20, width: 20, color: 'var(--primary)' }} />
              <Box>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{listings.length}</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Total Listings</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 24 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Star style={{ height: 20, width: 20, color: 'var(--accent)' }} />
              <Box>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{listings.filter(l => l.featured).length}</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Featured</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 24 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Eye style={{ height: 20, width: 20, color: 'var(--primary)' }} />
              <Box>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {listings.reduce((total, listing) => total + (listing.views_count || 0), 0)}
                </Typography>
                <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Total Views</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
        <Card>
          <CardContent style={{ padding: 24 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DollarSign style={{ height: 20, width: 20, color: 'var(--accent)' }} />
              <Box>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 700 }}>{new Set(categories).size}</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Categories</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Listings */}
      <Card>
        <CardHeader>
          <CardTitle>Listings ({filteredListings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredListings.map((listing) => (
              <Box key={listing.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, border: 1, borderColor: 'divider', borderRadius: 2, '&:hover': { bgcolor: 'var(--muted)', opacity: 0.5 } }}>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{listing.title}</Typography>
                    <Badge variant="outline">
                      {listing.category.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </Badge>
                    {listing.featured && (
                      <Badge style={{ backgroundColor: 'var(--secondary)', opacity: 0.1, color: 'var(--secondary)' }}>Featured</Badge>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.875rem', color: 'var(--muted-foreground)', mb: 1 }}>
                    <Box>Business: {listing.business_name}</Box>
                    {listing.price && (
                      <Box>
                        Price: {listing.currency} {listing.price}
                        {listing.price_type !== "fixed" && ` (${listing.price_type})`}
                      </Box>
                    )}
                    {listing.location && (
                      <Box>Location: {listing.location}</Box>
                    )}
                  </Box>

                  {listing.description && (
                    <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                      {listing.description.slice(0, 100)}...
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {/* TODO: implement edit */}}
                  >
                    <Edit style={{ height: 16, width: 16 }} />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {/* TODO: implement delete */}}
                  >
                    <Trash2 style={{ height: 16, width: 16 }} />
                  </Button>
                </Box>
              </Box>
            ))}

            {filteredListings.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography sx={{ color: 'var(--muted-foreground)' }}>No listings found</Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
