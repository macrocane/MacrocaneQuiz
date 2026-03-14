
"use client";

import { ImagePlay, Trash2, ExternalLink } from "lucide-react";
import type { StoredMedia } from "@/lib/types";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface MediaGallerySidebarProps {
  mediaItems: StoredMedia[];
  onDeleteMedia: (media: StoredMedia) => void;
  isReadOnly: boolean;
}

export default function MediaGallerySidebar({ mediaItems, onDeleteMedia, isReadOnly }: MediaGallerySidebarProps) {
  const { toast } = useToast();
  
  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "URL Copiato!", description: "Incollalo nella domanda." });
  }

  return (
    <SidebarGroup className="flex-1">
      <SidebarGroupLabel className="flex items-center gap-2">
        <ImagePlay className="h-5 w-5" /> Galleria Media
      </SidebarGroupLabel>
      <SidebarMenu className="px-2 space-y-2">
        {mediaItems.length > 0 ? (
          mediaItems.map((media) => (
            <SidebarMenuItem key={media.id} className="flex items-center gap-2 group">
              <div className="flex-1 flex items-center gap-2 overflow-hidden bg-muted/30 p-1.5 rounded-md">
                {media.type === 'image' ? (
                  <img src={media.url} className="h-8 w-8 rounded object-cover" alt={media.name}/>
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-[8px] uppercase">{media.type}</div>
                )}
                <span className="text-xs truncate font-medium">{media.name}</span>
              </div>
              <div className="flex items-center">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyUrl(media.url)}><ExternalLink className="h-3.5 w-3.5"/></Button>
                {!isReadOnly && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDeleteMedia(media)}><Trash2 className="h-3.5 w-3.5"/></Button>}
              </div>
            </SidebarMenuItem>
          ))
        ) : (
          <p className="text-[10px] text-muted-foreground italic px-2">Nessun media aggiunto. Usa la Dashboard per aggiungere link.</p>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
