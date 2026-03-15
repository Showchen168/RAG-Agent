import { Loader2 } from "lucide-react";

export default function Loading() {
    return (
        <div className="flex h-full w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm">載入知識庫...</p>
            </div>
        </div>
    );
}
