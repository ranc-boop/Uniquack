import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SupabaseConfigNotice() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Supabase is not configured</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Copy `.env.example` to `.env.local`, set
          `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then
          apply the migration before testing auth and CRUD.
        </p>
      </CardContent>
    </Card>
  );
}
