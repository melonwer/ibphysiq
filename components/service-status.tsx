"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Activity
} from "lucide-react"

interface ServiceHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    llama: 'healthy' | 'unhealthy'
    gemini: 'healthy' | 'unhealthy'
    validation: 'healthy' | 'unhealthy'
  }
  details: string[]
}

interface ServiceStatusProps {
  health: ServiceHealth | null
  onRefresh: () => void
}

const STATUS_ICONS = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  unhealthy: XCircle
}

const STATUS_COLORS = {
  healthy: "text-green-500",
  degraded: "text-yellow-500", 
  unhealthy: "text-red-500"
}



export function ServiceStatus({ health, onRefresh }: ServiceStatusProps) {
  if (!health) {
    return (
      <Button variant="ghost" size="sm" onClick={onRefresh}>
        <Activity className="h-4 w-4" />
      </Button>
    )
  }

  const StatusIcon = STATUS_ICONS[health.overall]
  const statusColor = STATUS_COLORS[health.overall]

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
        <Badge 
          variant={health.overall === 'healthy' ? 'default' : 'destructive'}
          className="text-xs"
        >
          {health.overall}
        </Badge>
      </div>
      
      <Button variant="ghost" size="sm" onClick={onRefresh}>
        <RefreshCw className="h-4 w-4" />
      </Button>
    </div>
  )
}