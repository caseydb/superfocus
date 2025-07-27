import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignOut() {
  const handleSignOut = async () => {
    await signOut(auth);
  };
  return (
    <button
      onClick={handleSignOut}
      className="bg-black text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-800 transition cursor-pointer"
    >
      Sign Out
    </button>
  );
}
