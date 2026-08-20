# Reflection

## The persistent-storage consultation

Since the rules said I couldn't use localStorage or sessionStorage for
notes, I asked Claude Code what it actually recommended for storing them
instead. It said to stay with Supabase's database, which we were already
using, and add a `user_id` column to every table so each note, collection,
and tag knows exactly which account owns it. On top of that it set up
something called Row Level Security, which is basically a rule that lives
in the database itself and blocks you from ever pulling back someone
else's rows — not just the app hiding them from you on the screen.

The trade-off it explained was: we could filter "show me only my notes"
in our own code every time, or make the database refuse to hand over
anyone else's notes no matter what code asks for it. It recommended the
second one, because even if there's a bug later where the app forgets to
filter something, the database still won't leak the data. I went with
that, since it also matched everything else already set up in the
project.

## The bug I caught during testing

Once notes were switched from "everyone signed in can see everything" to
"only your own notes," I tested it the way the checklist said to: two
separate test accounts. The second account could still see the first
account's notes, which shouldn't have happened. Turned out the script
meant to delete the old "anyone logged in" rule had guessed the wrong
name for it, so the delete silently did nothing, and the old rule stayed
active right next to the new private one. With both rules there, the
looser one still won. I only found this because I actually tested with
two real accounts instead of trusting that the SQL ran without an error
message. We found the leftover rule sitting in the Supabase dashboard,
deleted it by hand on all four tables, then retested until neither
account could see the other's notes.

## A prompt Claude Code misread

When I asked for the image-upload feature (my optional task), Claude
Code started building it on the same branch as some other required work
I'd just finished. That didn't sit right with me, so I said something
like "I think it should be its own branch, no?" It agreed and moved the
work onto its own separate branch instead, which also made it clearer
that the optional task was really its own standalone piece of work,
provable on its own.
