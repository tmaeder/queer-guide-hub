import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, TrendingUp, Activity, Calendar, MapPin, ShoppingBag, BookOpen, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function AdminAnalytics() {
  const [stats, setStats] = useState({
    total_users: 0,
    total_venues: 0,
    verified_venues: 0,
    active_events: 0,
    total_groups: 0,
    active_listings: 0,
    total_articles: 0,
    total_memberships: 0,
    total_attendees: 0,
    total_favorites: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch statistics directly from database tables
      const [users, venues, events, groups, listings, articles, memberships, attendees, favorites] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('venues').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('community_groups').select('id', { count: 'exact', head: true }),
        supabase.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('news_articles').select('id', { count: 'exact', head: true }),
        supabase.from('group_memberships').select('id', { count: 'exact', head: true }),
        supabase.from('event_attendees').select('id', { count: 'exact', head: true }),
        supabase.from('marketplace_favorites').select('id', { count: 'exact', head: true })
      ]);

      setStats({
        total_users: users.count || 0,
        total_venues: venues.count || 0,
        verified_venues: venues.count || 0, // Assuming all venues are verified
        active_events: events.count || 0,
        total_groups: groups.count || 0,
        active_listings: listings.count || 0,
        total_articles: articles.count || 0,
        total_memberships: memberships.count || 0,
        total_attendees: attendees.count || 0,
        total_favorites: favorites.count || 0
      });
    } catch (error) {
      console.error('Error fetching analytics stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full p-6">
        <div className="text-center">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          Real-time platform statistics and engagement metrics
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.total_users}</div>
            <p className="text-xs text-muted-foreground">
              Registered platform users
            </p>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.active_events}</div>
            <p className="text-xs text-muted-foreground">
              Currently active events
            </p>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Venues</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.total_venues}</div>
            <p className="text-xs text-muted-foreground">
              Listed venues ({stats.verified_venues} verified)
            </p>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Community Groups</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.total_groups}</div>
            <p className="text-xs text-muted-foreground">
              Active community groups
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marketplace Items</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{stats.active_listings}</div>
            <p className="text-xs text-muted-foreground">Active listings</p>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">News Articles</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{stats.total_articles}</div>
            <p className="text-xs text-muted-foreground">Published articles</p>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Engagement</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{stats.total_memberships + stats.total_attendees + stats.total_favorites}</div>
            <p className="text-xs text-muted-foreground">Memberships + Attendees + Favorites</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="hover-scale">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Platform Breakdown
            </CardTitle>
            <CardDescription>
              Content distribution across platform sections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Events</span>
                <Badge variant="secondary">{stats.active_events} active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Venues</span>
                <Badge variant="secondary">{stats.total_venues} listed</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Groups</span>
                <Badge variant="secondary">{stats.total_groups} communities</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Marketplace</span>
                <Badge variant="secondary">{stats.active_listings} items</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">News</span>
                <Badge variant="secondary">{stats.total_articles} articles</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-scale">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Engagement Metrics
            </CardTitle>
            <CardDescription>
              User participation and interaction data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Group Memberships</span>
                <Badge variant="outline">{stats.total_memberships}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Event Attendees</span>
                <Badge variant="outline">{stats.total_attendees}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Marketplace Favorites</span>
                <Badge variant="outline">{stats.total_favorites}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">User Engagement Rate</span>
                <Badge variant="outline">
                  {stats.total_users > 0 ? 
                    Math.round(((stats.total_memberships + stats.total_attendees + stats.total_favorites) / stats.total_users) * 100) 
                    : 0}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 hover-scale">
          <CardHeader>
            <CardTitle>Platform Summary</CardTitle>
            <CardDescription>
              Overview of your community platform's current state
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Content & Community</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Total Users</span>
                    <span className="font-medium">{stats.total_users}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Community Groups</span>
                    <span className="font-medium">{stats.total_groups}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Group Members</span>
                    <span className="font-medium">{stats.total_memberships}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Events</span>
                    <span className="font-medium">{stats.active_events}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Business & Content</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Venues Listed</span>
                    <span className="font-medium">{stats.total_venues}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Marketplace Items</span>
                    <span className="font-medium">{stats.active_listings}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>News Articles</span>
                    <span className="font-medium">{stats.total_articles}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Total Interactions</span>
                    <span className="font-medium">{stats.total_attendees + stats.total_favorites}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}