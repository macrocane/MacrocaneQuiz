
"use client";

import { Users, Trophy, Trash2 } from "lucide-react";
import type { Participant, LeaderboardEntry } from "@/lib/types";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarGroupAction,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";


interface ParticipantsSidebarProps {
  participants: Participant[];
  leaderboard: LeaderboardEntry[];
  onResetLeaderboard: () => void;
  isReadOnly: boolean;
}

export default function ParticipantsSidebar({
  participants,
  leaderboard,
  onResetLeaderboard,
  isReadOnly,
}: ParticipantsSidebarProps) {
  
  const sortedLeaderboard = leaderboard ? [...leaderboard].sort((a,b) => b.monthlyScore - a.monthlyScore) : [];

  return (
    <div className="flex flex-col h-full">
      <SidebarGroup>
        <SidebarGroupLabel className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Partecipanti ({participants.length})
        </SidebarGroupLabel>
        <SidebarMenu>
          {participants.length > 0 ? (
            participants.map((participant) => (
              <SidebarMenuItem key={participant.id}>
                <div className="flex items-center justify-between w-full text-sm">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={participant.avatar} alt={participant.name} />
                      <AvatarFallback>{participant.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{participant.name}</span>
                  </div>
                  <span className="font-mono font-semibold">{participant.score} pti</span>
                </div>
              </SidebarMenuItem>
            ))
          ) : (
            <p className="text-sm text-muted-foreground px-2">Ancora nessun partecipante.</p>
          )}
        </SidebarMenu>
      </SidebarGroup>
      <Separator className="my-2"/>
      <SidebarGroup className="flex-1">
        <SidebarGroupLabel className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Classifica
           <AlertDialog>
              <AlertDialogTrigger asChild disabled={isReadOnly}>
                 <SidebarGroupAction asChild>
                    <Button variant="ghost" size="icon" className={cn("h-6 w-6", isReadOnly && "hidden")}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </SidebarGroupAction>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Questa azione non può essere annullata. Questo eliminerà permanentemente la classifica.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={onResetLeaderboard}>Continua</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </SidebarGroupLabel>
        <SidebarMenu>
          {sortedLeaderboard.length > 0 ? (
            sortedLeaderboard.map((entry, index) => (
            <SidebarMenuItem key={entry.id || entry.name}>
              <div className="flex items-center justify-between w-full text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-base w-6 text-center">{index + 1}</span>
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={entry.avatar} alt={entry.name} />
                    <AvatarFallback>{entry.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{entry.name}</span>
                </div>
                <span className="font-mono font-semibold">{entry.monthlyScore} pti</span>
              </div>
            </SidebarMenuItem>
          ))
          ) : (
             <p className="text-sm text-muted-foreground px-2">La classifica è vuota. Completa un quiz per popolarla!</p>
          )}
        </SidebarMenu>
      </SidebarGroup>
    </div>
  );
}
