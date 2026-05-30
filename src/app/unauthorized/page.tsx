import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UnauthorizedPage() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Access denied</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your account is signed in, but this area requires a higher role. Admin
          pages require admin or super_admin, and user role management requires
          super_admin.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/">Back home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/questions">View public questions</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/auth/login">Sign in as another user</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
