import { type CentralizedTag, type CategoryTreeNode } from '@/hooks/useCentralizedTags';
import { TagListRenderer } from '@/components/resources/TagListRenderer';
import {
  getCategoryIcon,
  getCategoryShortName,
} from '@/components/resources/categoryMeta';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArrowLeft, Tag, ChevronRight, AlertTriangle, Phone } from 'lucide-react';
import { hoverCardCls, type DisplayMode } from './resourceHelpers';

interface ResourceCategoryProps {
  selectedCategory: string;
  categoriesTree: CategoryTreeNode[];
  allTags: CentralizedTag[];
  tagUsageCounts: Record<string, number>;
  displayMode: DisplayMode;
  onTagClick: (tag: CentralizedTag) => void;
  onBack: () => void;
  onSelectSubcategory: (name: string) => void;
}

export function ResourceCategory({
  selectedCategory,
  categoriesTree,
  allTags,
  tagUsageCounts,
  displayMode,
  onTagClick,
  onBack,
  onSelectSubcategory,
}: ResourceCategoryProps) {
  const renderTagList = (tags: CentralizedTag[]) => (
    <TagListRenderer
      tags={tags}
      displayMode={displayMode}
      tagUsageCounts={tagUsageCounts}
      onTagClick={onTagClick}
    />
  );

  const node = categoriesTree.find((c) => c.name === selectedCategory);
  const allChildren = node?.children ?? [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
          Back
        </Button>
        {(() => {
          const Icon = getCategoryIcon(selectedCategory);
          return <Icon style={{ width: 18, height: 18 }} />;
        })()}
        <h6 className="text-base font-semibold">{getCategoryShortName(selectedCategory)}</h6>
        <Badge variant="secondary">
          {categoriesTree.find((c) => c.name === selectedCategory)?.total_tag_count ?? 0}
        </Badge>
      </div>

      {/* Crisis help banner in Support & News */}
      {selectedCategory === 'Support & News' && (
        <Alert className="mb-6">
          <AlertTriangle size={20} />
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>Need immediate help? Browse our curated crisis hotlines directory.</span>
            <Button asChild variant="outline" size="sm">
              <LocalizedLink to="/help">
                <Phone size={14} className="mr-1" />
                Crisis Hotlines
              </LocalizedLink>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!node || allChildren.length === 0 ? (
        (() => {
          const flat = allTags
            .filter((t) =>
              t.categories?.some(
                (c) => c.name === selectedCategory || c.parent_name === selectedCategory,
              ),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
          return flat.length > 0 ? (
            renderTagList(flat)
          ) : (
            <EmptyState
              icon={Tag}
              title="No tags in this category yet"
              description="Check back soon — this bucket is being filled."
              mood="encouraging"
            />
          );
        })()
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {allChildren.map((child) => {
              const Icon = getCategoryIcon(child.name);
              const isEmpty = child.tag_count === 0;
              return (
                <button
                  key={child.id}
                  onClick={() => {
                    if (isEmpty) return;
                    onSelectSubcategory(child.name);
                  }}
                  className={hoverCardCls}
                  style={isEmpty ? { opacity: 0.45, cursor: 'default' } : undefined}
                  aria-disabled={isEmpty || undefined}
                >
                  <Icon style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.65 }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ fontSize: '0.85rem' }}>
                      {getCategoryShortName(child.name)}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {isEmpty ? 'Coming soon' : `${child.tag_count} tags`}
                    </span>
                  </div>
                  {!isEmpty && (
                    <ChevronRight
                      style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {allChildren.filter((c) => c.tag_count > 0).map((child) => {
            const childTags = allTags
              .filter((t) => t.categories?.some((c) => c.id === child.id))
              .sort(
                (a, b) => (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0),
              )
              .slice(0, 10);
            if (childTags.length === 0) return null;
            return (
              <div key={child.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{getCategoryShortName(child.name)}</p>
                    <Badge variant="secondary">{child.tag_count}</Badge>
                  </div>
                  <button
                    onClick={() => onSelectSubcategory(child.name)}
                    className="bg-transparent border-0 cursor-pointer p-0 text-primary text-xs hover:underline"
                  >
                    View all →
                  </button>
                </div>
                {renderTagList(childTags)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ResourceSubcategoryProps {
  selectedSubcategory: string;
  categoriesTree: CategoryTreeNode[];
  allTags: CentralizedTag[];
  tagUsageCounts: Record<string, number>;
  displayMode: DisplayMode;
  onTagClick: (tag: CentralizedTag) => void;
  onBack: () => void;
  onNavigateToParent: (parentName: string) => void;
}

export function ResourceSubcategory({
  selectedSubcategory,
  categoriesTree,
  allTags,
  tagUsageCounts,
  displayMode,
  onTagClick,
  onBack,
  onNavigateToParent,
}: ResourceSubcategoryProps) {
  const parent = categoriesTree.find((c) =>
    c.children.some((ch) => ch.name === selectedSubcategory),
  );
  const Icon = getCategoryIcon(selectedSubcategory);
  const subTags = allTags
    .filter((t) => t.categories?.some((c) => c.name === selectedSubcategory))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
          Back
        </Button>
        {parent && (
          <button
            onClick={() => onNavigateToParent(parent.name)}
            className="bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
          >
            <span className="text-sm">{getCategoryShortName(parent.name)}</span>
          </button>
        )}
        <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
        <Icon style={{ width: 18, height: 18 }} />
        <h6 className="text-base font-semibold">{getCategoryShortName(selectedSubcategory)}</h6>
        <Badge variant="secondary">{subTags.length}</Badge>
      </div>
      {subTags.length > 0 ? (
        <TagListRenderer
          tags={subTags}
          displayMode={displayMode}
          tagUsageCounts={tagUsageCounts}
          onTagClick={onTagClick}
        />
      ) : (
        <EmptyState
          icon={Tag}
          title="No tags here yet"
          description="This subcategory is being populated."
          mood="encouraging"
        />
      )}
    </div>
  );
}
