import Link from "next/link";

import { AvatarChip, Button } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import type { UserRow } from "@/lib/database.types";

export function SiteHeader({ profile }: { profile: UserRow }) {
  return (
    <header className="border-b-[2.5px] border-ink bg-cobalt">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-4">
        <Link
          href="/"
          className="min-w-0 truncate font-display text-base text-white sm:text-lg"
        >
          eventswithfriends
        </Link>

        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/post"
            className="font-display text-xs text-white hover:text-sunflower sm:text-sm"
          >
            post
          </Link>
          <Link
            href="/friends"
            className="font-display text-xs text-white hover:text-sunflower sm:text-sm"
          >
            friends
          </Link>
          <Link href="/profile" aria-label="your profile">
            <AvatarChip
              name={profile.display_name}
              src={profile.avatar_url}
              size={28}
            />
          </Link>
          <form action={signOut}>
            <Button variant="plain" className="px-1.5 py-1 text-xs sm:px-2 sm:text-sm">
              out
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
