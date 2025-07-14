import { Card, CardContent } from "@/components/ui/card";
import { 
  FileText, 
  Eye, 
  Edit, 
  Archive, 
  TrendingUp,
  Calendar,
  Users,
  Tag
} from "lucide-react";
import { Content } from "@/hooks/useContent";

interface ContentStatsProps {
  content: Content[];
}

export const ContentStats = ({ content }: ContentStatsProps) => {
  const stats = {
    total: content.length,
    published: content.filter(c => c.status === "published").length,
    drafts: content.filter(c => c.status === "draft").length,
    archived: content.filter(c => c.status === "archived").length,
    blogPosts: content.filter(c => c.content_type === "blog_post").length,
    pages: content.filter(c => c.content_type === "page").length,
    thisMonth: content.filter(c => {
      const createdDate = new Date(c.created_at);
      const now = new Date();
      return createdDate.getMonth() === now.getMonth() && 
             createdDate.getFullYear() === now.getFullYear();
    }).length,
    uniqueAuthors: new Set(content.map(c => c.author_id).filter(Boolean)).size,
    uniqueTags: new Set(content.flatMap(c => c.tags?.map(t => t.id) || [])).size
  };

  const publishRate = stats.total > 0 ? Math.round((stats.published / stats.total) * 100) : 0;

  const statCards = [
    {
      title: "Total Content",
      value: stats.total,
      icon: FileText,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "Published",
      value: stats.published,
      icon: Eye,
      color: "text-success",
      bgColor: "bg-success/10",
      subtitle: `${publishRate}% of total`
    },
    {
      title: "Drafts",
      value: stats.drafts,
      icon: Edit,
      color: "text-warning",
      bgColor: "bg-warning/10"
    },
    {
      title: "This Month",
      value: stats.thisMonth,
      icon: Calendar,
      color: "text-info",
      bgColor: "bg-info/10"
    },
    {
      title: "Blog Posts",
      value: stats.blogPosts,
      icon: TrendingUp,
      color: "text-secondary",
      bgColor: "bg-secondary/10"
    },
    {
      title: "Authors",
      value: stats.uniqueAuthors,
      icon: Users,
      color: "text-accent-foreground",
      bgColor: "bg-accent/10"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {statCards.map((stat, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                {stat.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                )}
              </div>
              <div className={`p-2 rounded-full ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};