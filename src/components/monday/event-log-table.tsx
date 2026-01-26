"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
} from "lucide-react";
import { format } from "date-fns";

interface EventLog {
  id: string;
  direction: string;
  eventType: string;
  source: string;
  status: string;
  errorMessage: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  accountName: string | null;
}

interface EventLogTableProps {
  events: EventLog[];
}

export function EventLogTable({ events }: EventLogTableProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No integration events recorded yet
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "PENDING":
      case "PROCESSING":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "SKIPPED":
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SUCCESS":
        return (
          <Badge
            variant="outline"
            className="bg-green-500/10 text-green-600 border-green-500/20"
          >
            Success
          </Badge>
        );
      case "FAILED":
        return (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-600 border-red-500/20"
          >
            Failed
          </Badge>
        );
      case "PENDING":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
          >
            Pending
          </Badge>
        );
      case "PROCESSING":
        return (
          <Badge
            variant="outline"
            className="bg-blue-500/10 text-blue-600 border-blue-500/20"
          >
            Processing
          </Badge>
        );
      case "SKIPPED":
        return <Badge variant="outline">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Direction</TableHead>
          <TableHead>Event Type</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell>
              <div className="flex items-center gap-1">
                {event.direction === "INBOUND" ? (
                  <ArrowDownToLine className="h-4 w-4 text-blue-500" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4 text-purple-500" />
                )}
                <span className="text-xs">
                  {event.direction === "INBOUND" ? "In" : "Out"}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                {event.eventType}
              </code>
            </TableCell>
            <TableCell className="text-sm">{event.source}</TableCell>
            <TableCell>{getStatusBadge(event.status)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format(new Date(event.receivedAt), "MMM d, h:mm:ss a")}
            </TableCell>
            <TableCell className="max-w-[200px]">
              {event.errorMessage && (
                <span
                  className="text-xs text-red-500 truncate block"
                  title={event.errorMessage}
                >
                  {event.errorMessage}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
