import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Edit, 
  Eye, 
  Trash2, 
  Calendar, 
  User, 
  ExternalLink,
  Clock,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { Content } from "@/hooks/useContent";
import { useNavigate } from "react-router-dom";

interface ContentCardProps {
  content: Content;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  showActions?: boolean;
  compact?: boolean;
}

export const ContentCard = ({ 
  content, 
  onDelete, 
  onEdit, 
  showActions = true,
  compact = false 
}: ContentCardProps) => {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-success/10 text-success border-success/20";
      case "draft": return "bg-warning/10 text-warning border-warning/20";
      case "archived": return "bg-muted text-muted-foreground border-muted-foreground/20";
      default: return "bg-muted text-muted-foreground border-muted-foreground/20";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "blog_post": return "bg-primary/10 text-primary border-primary/20";
      case "page": return "bg-secondary/10 text-secondary border-secondary/20";
      case "legal_document": return "bg-destructive/10 text-destructive border-destructive/20";
      case "press_release": return "bg-accent/10 text-accent-foreground border-accent/20";
      case "about_content": return "bg-secondary/10 text-secondary border-secondary/20 dark:bg-secondary/20 dark:text-secondary dark:border-secondary/30";
      default: return "bg-muted text-muted-foreground border-muted-foreground/20";
    }
  };

  const getPreviewUrl = () => {
    return content.content_type === "blog_post" 
      ? `/blog/${content.slug}` 
      : `/${content.slug}`;
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this content?")) return;
    
    setIsDeleting(true);
    try {
      await onDelete?.(content.id);
    } finally {
      setIsDeleting(false);
    }
  };

  if (compact) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium truncate">{content.title}</h4>
                <Badge variant="outline" className={getStatusColor(content.status)}>
                  {content.status}
                </Badge>
              </div>
              {content.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                  {content.excerpt}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(content.created_at), "MMM d")}
                </div>
                <Badge variant="outline" className={getTypeColor(content.content_type)}>
                  {content.content_type.replace("_", " ")}
                </Badge>
              </div>
            </div>
            {showActions && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit?.(content.id)}
                >
                  <Edit className="h-3 w-3" />
                </Button>
                {content.status === "published" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(getPreviewUrl(), "_blank")}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-lg leading-tight">{content.title}</h3>
              <Badge variant="outline" className={getStatusColor(content.status)}>
                {content.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getTypeColor(content.content_type)}>
                <FileText className="h-3 w-3 mr-1" />
                {content.content_type.replace("_", " ")}
              </Badge>
              {content.categories?.map((category) => (
                <Badge 
                  key={category.id} 
                  variant="outline"
                  style={{ 
                    backgroundColor: `${category.color}15`,
                    borderColor: `${category.color}40`,
                    color: category.color 
                  }}
                >
                  {category.name}
                </Badge>
              ))}
            </div>
          </div>
          {showActions && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit?.(content.id)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              {content.status === "published" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(getPreviewUrl(), "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {content.excerpt && (
          <p className="text-muted-foreground mb-4 line-clamp-3">
            {content.excerpt}
          </p>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {content.published_at 
                ? format(new Date(content.published_at), "MMM d, yyyy")
                : format(new Date(content.created_at), "MMM d, yyyy")
              }
            </div>
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {content.author?.display_name || "Unknown"}
            </div>
            {content.status === "draft" && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Last edited {format(new Date(content.updated_at), "MMM d")}
              </div>
            )}
          </div>
          
          {/* Remove tags section as they no longer exist on content */}
        </div>
      </CardContent>
    </Card>
  );
};