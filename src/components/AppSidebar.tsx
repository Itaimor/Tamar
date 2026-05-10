import { MessageCircle, BarChart3, CalendarDays, Leaf } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type Tab = "chat" | "analysis" | "history" | "insights";

interface AppSidebarProps {
  active: Tab;
  onTabChange: (tab: Tab) => void;
}

const items = [
  { id: "chat", icon: MessageCircle, title: "Chat" },
  { id: "analysis", icon: BarChart3, title: "Analysis" },
  { id: "history", icon: CalendarDays, title: "History" },
  { id: "insights", icon: Leaf, title: "Insights" },
];

export function AppSidebar({ active, onTabChange }: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id} className="mb-1">
                  <SidebarMenuButton
                    onClick={() => onTabChange(item.id as Tab)}
                    isActive={active === item.id}
                    tooltip={item.title}
                    className="h-12 px-4"
                  >
                    <item.icon className="h-6 w-6" />
                    <span className="text-base font-medium ml-2">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
