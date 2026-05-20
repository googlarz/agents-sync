import NextAuth from "next-auth";

// HACK: next-auth v4 requires this exact config shape — do not destructure
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [],
});
