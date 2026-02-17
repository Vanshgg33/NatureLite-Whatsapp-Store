'use client';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Bot, Users, Settings } from 'lucide-react';

const chatFlows = [
  { id: 1, name: 'Main Menu', description: 'Entry point for all conversations', state: 'main_menu', active: true },
  { id: 2, name: 'Browse Products', description: 'Product catalog browsing flow', state: 'browsing', active: true },
  { id: 3, name: 'Cart & Checkout', description: 'Shopping cart and checkout process', state: 'cart', active: true },
  { id: 4, name: 'Order Tracking', description: 'View and track orders', state: 'order_tracking', active: true },
  { id: 5, name: 'FAQ', description: 'Frequently asked questions', state: 'faq', active: true },
  { id: 6, name: 'Support Handoff', description: 'Transfer to human support', state: 'support', active: true },
];

export default function ChatFlowsPage() {
  return (
    <div>
      <Header
        title="Chat Flows"
        description="Configure chatbot conversation flows"
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Active Flows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{chatFlows.filter(f => f.active).length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Today's Sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Support Handoffs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Total States
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{chatFlows.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Chat Flow States</CardTitle>
            <CardDescription>
              Configure the behavior of each conversation state
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {chatFlows.map((flow) => (
                <div
                  key={flow.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{flow.name}</p>
                      <p className="text-sm text-muted-foreground">{flow.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="font-mono">
                      {flow.state}
                    </Badge>
                    <Badge className={flow.active ? 'bg-green-100 text-green-800' : ''}>
                      {flow.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      Configure
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
