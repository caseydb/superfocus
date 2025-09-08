import { signOutUser } from "@/lib/auth";

export default function SignOut() {
  const handleSignOut = async () => {
    await signOutUser();
  };
  return (
    <button
      onClick={handleSignOut}
      className="bg-elegant-dark text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-800 transition cursor-pointer"
    >
      Sign Out
    </button>
  );
}
