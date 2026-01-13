"use client";

import { ImagePlay, Trash2 } from "lucide-react";
import type { StoredMedia } from "@/lib/types";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface MediaGallerySidebarProps {
  mediaItems: StoredMedia[];
  onDeleteMedia: (id: string) => void;
  isReadOnly: boolean;
}

export default function MediaGallerySidebar({
  mediaItems,
  onDeleteMedia,
  isReadOnly,
}: MediaGallerySidebarProps) {
  
  return (
    <>
      <Separator className="my-2"/>
      <SidebarGroup className="flex-1">
        <SidebarGroupLabel className="flex items-center gap-2">
          <ImagePlay className="h-5 w-5" />
          Galleria
        </SidebarGroupLabel>
        <SidebarMenu>
          {mediaItems.length > 0 ? (
            mediaItems.map((media) => (
              <SidebarMenuItem key={media.id}>
                <div className="flex items-center justify-between w-full text-sm">
                  <div className="flex items-center gap-3 truncate">
                    {media.type.startsWith('image') ? (
                        <img src={media.url} alt={media.name} className="h-8 w-8 rounded object-cover"/>
                    ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                            <span className="text-xs">{media.type.split('/')[0]}</span>
                        </div>
                    )}
                    <span className="font-medium truncate">{media.name}</span>
                  </div>

                   <AlertDialog>
                      <AlertDialogTrigger asChild disabled={isReadOnly}>
                         <Button variant="ghost" size="icon" className={cn("h-7 w-7 flex-shrink-0", isReadOnly && "hidden")}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Questa azione non può essere annullata. Questo eliminerà permanentemente il file multimediale.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDeleteMedia(media.id)}>Continua</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </div>
              </SidebarMenuItem>
            ))
          ) : (
            <p className="text-sm text-muted-foreground px-2">Nessun media caricato.</p>
          )}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
