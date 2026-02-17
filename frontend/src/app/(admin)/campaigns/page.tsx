'use client';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Send } from 'lucide-react';

export default function CampaignsPage() {
  return (
    <div>
      <Header
        title="Campaigns"
        description="Create and manage broadcast campaigns"
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Quick Broadcast
              </CardTitle>
              <CardDescription>Send a message to all customers</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Create Broadcast
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Promotional Campaigns</CardTitle>
              <CardDescription>Schedule promotional messages</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Active campaigns</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign Analytics</CardTitle>
              <CardDescription>Track message delivery</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Messages sent today</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              No campaigns yet. Create your first broadcast campaign.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
