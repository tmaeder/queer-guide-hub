import React from 'react';
import { RAGKnowledgeBase } from '@/components/knowledge/RAGKnowledgeBase';
import { Brain, Database, Search, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function KnowledgeBase() {
  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Brain className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">AI Knowledge Base</h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          Ask intelligent questions about venues, events, community groups, tags, and marketplace items. 
          Our AI searches through the entire Queer Guide database to provide comprehensive, context-aware answers.
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="text-center">
            <Search className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <CardTitle className="text-lg">Semantic Search</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              Advanced vector-based search understands context and meaning, not just keywords.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-center">
            <Database className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <CardTitle className="text-lg">Comprehensive Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              Searches across venues, events, groups, tags, and marketplace items in real-time.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-center">
            <Zap className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <CardTitle className="text-lg">AI-Powered Answers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              Get intelligent, conversational responses with sources and context.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main RAG Interface */}
      <RAGKnowledgeBase 
        placeholder="Try asking: 'Find LGBTQ+ friendly venues in San Francisco' or 'What pride events are happening this month?'"
        showHistory={true}
      />

      {/* Example Queries */}
      <Card>
        <CardHeader>
          <CardTitle>Example Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Venues</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• "Find queer-friendly coffee shops in Berlin"</li>
                <li>• "What venues are wheelchair accessible?"</li>
                <li>• "Show me drag bars with outdoor seating"</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Events</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• "What pride events are happening this weekend?"</li>
                <li>• "Find queer book clubs in London"</li>
                <li>• "Show me trans support group meetings"</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Community</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• "Find LGBTQ+ professional networking groups"</li>
                <li>• "What are good resources for coming out?"</li>
                <li>• "Show me lesbian social groups in my area"</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Marketplace</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• "Find queer-owned businesses selling pride merchandise"</li>
                <li>• "What LGBTQ+ books are available?"</li>
                <li>• "Show me trans-affirming clothing brands"</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}