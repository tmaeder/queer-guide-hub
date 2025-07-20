import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, TrendingUp, Activity, Calendar, MapPin } from "lucide-react";

export default function AdminAnalytics() {
  return (
    <div className="w-full p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor site performance and user engagement metrics
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,847</div>
            <p className="text-xs text-muted-foreground">
              +12% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">156</div>
            <p className="text-xs text-muted-foreground">
              +5% from last week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Venues Listed</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">432</div>
            <p className="text-xs text-muted-foreground">
              +8% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Site Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89.2%</div>
            <p className="text-xs text-muted-foreground">
              +2.1% from yesterday
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              User Growth
            </CardTitle>
            <CardDescription>
              Monthly user registration trends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">January</span>
                <Badge variant="secondary">+234 users</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">February</span>
                <Badge variant="secondary">+189 users</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">March</span>
                <Badge variant="secondary">+312 users</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">April</span>
                <Badge variant="secondary">+267 users</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Content Analytics
            </CardTitle>
            <CardDescription>
              Most popular content categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Events</span>
                <Badge variant="outline">1,247 views</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Venues</span>
                <Badge variant="outline">987 views</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Marketplace</span>
                <Badge variant="outline">743 views</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Directory</span>
                <Badge variant="outline">612 views</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest user actions and system events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline">User</Badge>
                <span>New user registration: alex@example.com</span>
                <span className="text-muted-foreground ml-auto">2 minutes ago</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline">Event</Badge>
                <span>New event created: "Pride Festival 2024"</span>
                <span className="text-muted-foreground ml-auto">15 minutes ago</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline">Venue</Badge>
                <span>Venue updated: Rainbow Coffee Shop</span>
                <span className="text-muted-foreground ml-auto">1 hour ago</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline">System</Badge>
                <span>Database backup completed successfully</span>
                <span className="text-muted-foreground ml-auto">3 hours ago</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}