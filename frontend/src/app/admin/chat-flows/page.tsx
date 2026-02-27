'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, MessageSquare, ShoppingCart, Package, MapPin, CreditCard, HelpCircle, Headphones } from 'lucide-react';

const chatStates = [
  {
    id: 'main_menu',
    name: 'Main Menu',
    icon: MessageSquare,
    color: 'bg-blue-100 text-blue-700',
    description: 'Entry point - Browse, Cart, Orders, FAQ, Support',
    transitions: ['browsing', 'cart', 'order_tracking', 'faq', 'support'],
  },
  {
    id: 'browsing',
    name: 'Browsing',
    icon: Package,
    color: 'bg-green-100 text-green-700',
    description: 'Browse categories and products with pagination',
    transitions: ['product_detail', 'main_menu'],
  },
  {
    id: 'product_detail',
    name: 'Product Detail',
    icon: Package,
    color: 'bg-emerald-100 text-emerald-700',
    description: 'View product info, add to cart, or buy now',
    transitions: ['cart', 'checkout', 'browsing'],
  },
  {
    id: 'cart',
    name: 'Cart',
    icon: ShoppingCart,
    color: 'bg-orange-100 text-orange-700',
    description: 'View cart items, checkout, continue shopping, or clear',
    transitions: ['checkout', 'browsing', 'main_menu'],
  },
  {
    id: 'checkout',
    name: 'Checkout',
    icon: MapPin,
    color: 'bg-purple-100 text-purple-700',
    description: 'Select saved address or enter new address',
    transitions: ['payment_selection', 'address_input', 'cart'],
  },
  {
    id: 'address_input',
    name: 'Address Input',
    icon: MapPin,
    color: 'bg-violet-100 text-violet-700',
    description: 'Manual address entry (multi-line text parsing)',
    transitions: ['payment_selection'],
  },
  {
    id: 'payment_selection',
    name: 'Payment',
    icon: CreditCard,
    color: 'bg-yellow-100 text-yellow-700',
    description: 'COD or prepaid - creates order on selection',
    transitions: ['main_menu', 'checkout'],
  },
  {
    id: 'order_tracking',
    name: 'Order Tracking',
    icon: Package,
    color: 'bg-cyan-100 text-cyan-700',
    description: 'View recent orders, check status, reorder',
    transitions: ['reorder', 'main_menu'],
  },
  {
    id: 'reorder',
    name: 'Reorder',
    icon: ShoppingCart,
    color: 'bg-teal-100 text-teal-700',
    description: 'Confirm reorder, modify items, or cancel',
    transitions: ['checkout', 'cart', 'main_menu'],
  },
  {
    id: 'faq',
    name: 'FAQ',
    icon: HelpCircle,
    color: 'bg-indigo-100 text-indigo-700',
    description: 'Shipping, returns, payment, contact info',
    transitions: ['support', 'main_menu'],
  },
  {
    id: 'support',
    name: 'Support',
    icon: Headphones,
    color: 'bg-red-100 text-red-700',
    description: 'Handoff to human support agent',
    transitions: ['main_menu'],
  },
];

export default function ChatFlowsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chatbot Flow</h1>
        <p className="text-muted-foreground">
          Visual overview of the WhatsApp chatbot state machine
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>State Machine Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-sm text-muted-foreground">States:</span>
            {chatStates.map((state) => (
              <Badge key={state.id} variant="outline">
                {state.name}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            The chatbot uses a state-based flow engine. Each customer message is processed based on
            their current session state, and the bot transitions them to the appropriate next state.
            Commands like &quot;menu&quot;, &quot;start&quot;, or &quot;hi&quot; reset to the main menu from any state.
          </p>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {chatStates.map((state) => (
          <Card key={state.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className={`p-2 rounded-lg ${state.color}`}>
                  <state.icon className="h-4 w-4" />
                </div>
                {state.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{state.description}</p>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Transitions to:</p>
                <div className="flex flex-wrap gap-1">
                  {state.transitions.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      {chatStates.find((s) => s.id === t)?.name || t}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auto-Detection Commands</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Menu Reset Commands</h4>
              <div className="flex flex-wrap gap-1">
                {['menu', 'start', 'hi', 'hello', 'hey', '/start', '/menu'].map((cmd) => (
                  <Badge key={cmd} variant="outline">{cmd}</Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                These commands reset the session to main_menu from any state
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Session Expiry</h4>
              <p className="text-sm text-muted-foreground">
                Sessions automatically expire after 24 hours of inactivity.
                The cleanup cron runs every hour.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
