import Link from "next/link";

import { AvatarChip, Button } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import type { UserRow } from "@/lib/database.types";

export function SiteHeader({ profile }: { profile: UserRow }) {
  return (
    <header className="border-b-[2.5px] border-ink bg-cobalt">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-2">
        <Link href="/" className="font-display text-lg text-white">
          eventswithfriends
        </Link>

        <nav className="flex items-center gap-3">
          <Link
            href="/post"
            className="font-display text-sm text-white hover:text-sunflower"
          >
            post
          </Link>
          <Link
            href="/friends"
            className="font-display text-sm text-white hover:text-sunflower"
          >
            friends
          </Link>
          <AvatarChip
            name={profile.display_name}
            src={profile.avatar_url}
            size={28}
          />
          <form action={signOut}>
            <Button variant="plain" className="px-2 py-1 text-sm">
              out
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
