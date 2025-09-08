"use client";

import { useInstance } from "../Components/Instances";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuickJoin } from "../hooks/useQuickJoin";
import SignIn from "./SignIn";
import { signInWithGoogle, signOutUser } from "@/lib/auth";
import Image from "next/image";
import { useSelector } from "react-redux";
import { RootState } from "../store/store";
import { DotSpinner } from "ldrs/react";
import "ldrs/react/DotSpinner.css";

export default function Lobby() {
  const { instances, currentInstance, createInstance, user, userReady } = useInstance();
  const router = useRouter();
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showPrivateRoomModal, setShowPrivateRoomModal] = useState(false);
  const [privateRoomName, setPrivateRoomName] = useState("");
  const [roomNameError, setRoomNameError] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  // Refs for scroll animations
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  // Get user from Redux
  const reduxUser = useSelector((state: RootState) => state.user);

  // Check if user is signed in (not a temporary user)
  const signedIn = userReady && user.id && !user.id.startsWith("user-");

  // Get display name
  const displayName = reduxUser.first_name
    ? reduxUser.last_name
      ? `${reduxUser.first_name} ${reduxUser.last_name}`
      : reduxUser.first_name
    : user?.displayName || "User";

  // Close modal when signed in
  useEffect(() => {
    if (signedIn) setShowSignInModal(false);
  }, [signedIn]);

  // Redirect to room URL when joining a room
  useEffect(() => {
    if (currentInstance) {
      router.push(`/${currentInstance.url}`);
    }
  }, [currentInstance, router]);

  // Room cleanup is now handled by PresenceService

  // Handle scroll effects
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserDropdown && !(event.target as Element).closest(".user-dropdown")) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showUserDropdown]);


  // Calculate total users in all rooms
  const totalUsers = instances.reduce((sum, instance) => sum + instance.users.length, 0);

  // Check if room name is already taken
  const isRoomNameTaken = (name: string) => {
    return instances.some((instance) => instance.url === name);
  };

  const handleCreatePrivateRoom = () => {
    const roomName = privateRoomName.trim();
    if (!roomName) return;

    if (isRoomNameTaken(roomName)) {
      setRoomNameError("Room name already taken. Please choose a different name.");
      return;
    }

    setIsJoiningRoom(true);
    createInstance("private", roomName);
    setShowPrivateRoomModal(false);
    setPrivateRoomName("");
    setRoomNameError("");
  };

  const { quickJoin } = useQuickJoin();
  
  const handleQuickJoin = useCallback(() => {
    setIsJoiningRoom(true);
    quickJoin();
  }, [quickJoin]);
  
  // Check for auto-join or auto-create flags from WorkSpace redirect
  useEffect(() => {
    const shouldAutoJoin = sessionStorage.getItem('autoQuickJoin');
    const shouldAutoCreate = sessionStorage.getItem('autoCreateRoom');
    
    if (userReady && !currentInstance) {
      if (shouldAutoJoin === 'true') {
        sessionStorage.removeItem('autoQuickJoin');
        // Small delay to ensure everything is loaded
        setTimeout(() => {
          handleQuickJoin();
        }, 100);
      } else if (shouldAutoCreate === 'true') {
        sessionStorage.removeItem('autoCreateRoom');
        // Create a new public room directly
        setTimeout(() => {
          setIsJoiningRoom(true);
          createInstance("public");
        }, 100);
      }
    }
  }, [userReady, currentInstance, createInstance, handleQuickJoin]);

  // Show loading screen when joining a room
  if (isJoiningRoom || currentInstance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-elegant-dark">
        <DotSpinner size="40" speed="0.9" color="#FFAA00" />
      </div>
    );
  }

  const features = [
    {
      icon: "⏱️",
      title: "Focus Timer",
      description: "Choose between classic stopwatch or custom countdown",
    },
    {
      icon: "👥",
      title: "Live Presence",
      description: "Know who is actively working with sound effects",
    },
    {
      icon: "🏆",
      title: "Leaderboard",
      description: "Turn productivity into friendly competition",
    },
    {
      icon: "📊",
      title: "Analytics",
      description: "Know exactly where your time goes",
    },
  ];

  return (
    <div className="min-h-screen text-white overflow-x-hidden relative">
      {/* Continuous Background for Entire Page */}
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23FFAA00' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
      </div>
      
      {/* Content Container */}
      <div className="relative z-10">
      {/* Fixed Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div
          className={`absolute inset-0 bg-black backdrop-blur-lg transition-opacity duration-300 ${
            scrolled ? "opacity-90" : "opacity-0"
          }`}
        ></div>
        <div
          className={`absolute bottom-0 left-0 right-0 h-px bg-gray-800 transition-opacity duration-300 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        ></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold">
                Locked<span className="text-[#FFAA00]">In</span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              {!signedIn ? (
                <button
                  onClick={() => signInWithGoogle()}
                  className="bg-[#FFAA00] text-black px-4 py-2 rounded-lg font-medium hover:bg-[#FFB833] transition cursor-pointer"
                >
                  Get Started
                </button>
              ) : (
                <div className="relative user-dropdown">
                  <button
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="flex items-center gap-2 text-white hover:text-[#FFAA00] transition-colors cursor-pointer"
                  >
                    <span className="font-medium">{displayName}</span>
                    <svg
                      className={`w-4 h-4 transition-transform ${showUserDropdown ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showUserDropdown && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-50">
                      <button
                        onClick={() => {
                          signOutUser();
                          setShowUserDropdown(false);
                        }}
                        className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 hover:text-[#FFAA00] transition-colors cursor-pointer rounded-lg"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">

        <div className="relative z-10 max-w-6xl mx-auto text-center">
          {/* Animated Hero Text */}
          <h1 className="text-5xl md:text-6xl font-extrabold mb-6 animate-fade-in-up">
            {/* <span className="block">Stay Locked In.</span> */}
            <span className="block text-white animate-pulse">
              Lock In. Get Sh<span className="text-[#FFAA00]">*</span>t Done.
            </span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto animate-fade-in-up animation-delay-200">
            Coworking meets Pomodoro. <br />
            Grind alongside others and feel the shared momentum.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-fade-in-up animation-delay-400">
            <button
              onClick={handleQuickJoin}
              className="bg-[#FFAA00] text-black px-8 py-4 rounded-full font-bold text-lg hover:bg-[#FFB833] transform hover:scale-105 transition-all shadow-lg cursor-pointer inline-block"
            >
              Join a Room Now
            </button>
          </div>

          {/* Live Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto animate-fade-in-up animation-delay-600">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#FFAA00] animate-pulse">11</div>
              <div className="text-sm text-gray-400">People Locked In</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#FFAA00] animate-pulse">529</div>
              <div className="text-sm text-gray-400">Tasks Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-[#FFAA00] animate-pulse">
                21,515
              </div>
              <div className="text-sm text-gray-400">Minutes Focused</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} className="py-32 px-4 relative">

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black mb-4">
              <span className="text-[#FFAA00]">Focus Time</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Everything you need to <span className="text-white font-semibold">stay focused</span>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="relative p-10 rounded-2xl border-2 border-gray-800 hover:border-[#FFAA00] transition-all duration-300 cursor-pointer bg-gray-950"
              >
                {/* Icon Container */}
                <div className="flex items-center justify-center w-20 h-20 mb-6 relative">
                  <div className="absolute inset-0 bg-gray-900 rounded-2xl"></div>
                  <span className="text-5xl relative z-10">{feature.icon}</span>
                </div>

                {/* Text Content */}
                <h3 className="text-2xl font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-32 px-4 relative overflow-hidden">

        <div className="max-w-6xl mx-auto relative z-10">
          <h2 className="text-5xl md:text-6xl font-black text-center mb-20">
            How it <span className="text-[#FFAA00]">works</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-12 lg:gap-16">
            {[
              {
                number: "1",
                title: "Join a Room",
                description: "Quick join or create your own private space",
              },
              {
                number: "2",
                title: "Set Your Task",
                description: "Define what you're working on and start the timer",
              },
              {
                number: "3",
                title: "Get Sh*t Done",
                description: "Stay focused with others and celebrate wins together",
              },
            ].map((step, index) => (
              <div key={index} className="text-center group">
                {/* Elevated Circle Container */}
                <div className="relative w-28 h-28 mx-auto mb-8">
                  {/* Outer Ring */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#FFAA00] to-[#FFB833] rounded-full animate-pulse"></div>
                  <div className="absolute inset-1 bg-gray-950 rounded-full"></div>

                  {/* Inner Circle with Contained Glow */}
                  <div className="absolute inset-2 bg-gradient-to-br from-[#FFAA00] to-[#FF8C00] rounded-full shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] group-hover:shadow-[inset_0_2px_20px_rgba(0,0,0,0.7)] transition-all duration-300 overflow-hidden">
                    {/* Inner Glow Effect - Contained */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 via-[#FFAA00]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                    <div className="relative flex items-center justify-center h-full">
                      <span className="text-4xl font-black text-black drop-shadow-lg">{step.number}</span>
                    </div>
                  </div>

                  {/* 3D Effect - Bottom Highlight (subtle) */}
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-16 h-6 bg-gradient-to-t from-[#FFAA00]/10 to-transparent rounded-full blur-sm"></div>
                </div>

                {/* Text Content */}
                <h3 className="text-2xl font-bold mb-3 text-white group-hover:text-[#FFAA00] transition-colors duration-300">
                  {step.title}
                </h3>
                <p className="text-gray-400 max-w-xs mx-auto leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section ref={statsRef} className="py-32 px-4 relative overflow-hidden">
        
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-16">
            Join the <span className="text-[#FFAA00]">productivity revolution</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="bg-gray-900/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-800 hover:border-gray-700 transition-colors">
              <div className="text-yellow-400 mb-4">⭐⭐⭐⭐⭐</div>
              <p className="text-gray-300 italic mb-4">&ldquo;One of the most productive couple of hours of my life&rdquo;</p>
              <p className="font-bold text-white">Steve Baker | Founder @ Vendorsage</p>
            </div>
            <div className="bg-gray-900/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-800 hover:border-gray-700 transition-colors">
              <div className="text-yellow-400 mb-4">⭐⭐⭐⭐⭐</div>
              <p className="text-gray-300 italic mb-4">&ldquo;I&apos;ve tried every productivity app and this actually works&rdquo;</p>
              <p className="font-bold text-white">Ryan Walker | Founder @ NextStep</p>
            </div>
            <div className="bg-gray-900/80 backdrop-blur-sm p-8 rounded-2xl border border-gray-800 hover:border-gray-700 transition-colors">
              <div className="text-yellow-400 mb-4">⭐⭐⭐⭐⭐</div>
              <p className="text-gray-300 italic mb-4">
                &ldquo;The leaderboard keeps me motivated. I&apos;m 3x more productive with Locked In.&rdquo;
              </p>
              <p className="font-bold text-white">Jono Matla | CRO @ Impact</p>
            </div>
          </div>
        </div>
      </section>

      {/* Original Lobby Section - Redesigned */}
      <section
        id="lobby-section"
        className="py-32 px-4 relative overflow-hidden"
      >

        <div className="max-w-2xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-black mb-6 whitespace-nowrap">
              Ready to get <span className="text-[#FFAA00] animate-pulse">Locked In?</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-xl mx-auto">
              Join a room and start crushing your goals with others who are in the zone
            </p>
          </div>

          {!signedIn && (
            <div className="flex flex-col items-center mb-12">
              <button
                onClick={() => signInWithGoogle()}
                className="group relative px-8 py-4 bg-white text-black font-bold text-lg rounded-full overflow-hidden transition-all duration-300 hover:scale-105 shadow-xl cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#FFAA00] to-[#FFB833] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative flex items-center justify-center gap-3">
                  <Image src="/google.png" alt="Google" width={24} height={24} />
                  <span>Continue with Google</span>
                </div>
              </button>
              <div className="mt-6 text-gray-400">
                Don&apos;t have an account?{" "}
                <button
                  className="font-bold text-[#FFAA00] hover:text-[#FFB833] transition cursor-pointer"
                  onClick={() => setShowSignInModal(true)}
                >
                  Sign up free
                </button>
              </div>
            </div>
          )}

          {showSignInModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
              onClick={() => setShowSignInModal(false)}
            >
              <div className="relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                <SignIn onSuccess={() => setShowSignInModal(false)} />
              </div>
            </div>
          )}

          <div
            className={`relative ${
              !signedIn ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {/* Main Action Card */}
            <div className="relative bg-gray-950 rounded-3xl p-10 border-2 border-gray-800 hover:border-[#FFAA00] transition-all duration-300">
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#FFAA00]/10 via-transparent to-[#FFAA00]/10 opacity-0 hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
              
              <div className="relative z-10 flex flex-col items-center gap-8">
                {/* Quick Join Button */}
                <button
                  className="group relative px-12 py-6 bg-[#FFAA00] text-black font-black text-2xl rounded-full overflow-hidden transition-all duration-300 hover:scale-110 shadow-2xl cursor-pointer"
                  onClick={handleQuickJoin}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#FF8800] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative flex items-center gap-3">
                    <span className="text-3xl">🚀</span>
                    Quick Join
                  </span>
                </button>

                {/* Live Users Display */}
                <div className="text-gray-400 font-medium">
                  {totalUsers > 0
                    ? `${totalUsers} ${totalUsers === 1 ? "person" : "people"} working now`
                    : "Be the first to start"}
                </div>

                {/* Divider */}
                <div className="w-full max-w-xs h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>

                {/* Private Room Button */}
                <button
                  className="group relative px-6 py-3 bg-transparent border-2 border-gray-700 text-white font-bold rounded-full overflow-hidden transition-all duration-300 hover:border-[#FFAA00] cursor-pointer"
                  onClick={() => setShowPrivateRoomModal(true)}
                >
                  <div className="absolute inset-0 bg-[#FFAA00] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
                  <span className="relative group-hover:text-black transition-colors duration-300">
                    Create Private Room
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Private Room Name Modal */}
      {showPrivateRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-[#181A1B] rounded-2xl shadow-2xl p-8 w-full max-w-md border border-[#23272b] relative">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors text-xl cursor-pointer"
              onClick={() => {
                setShowPrivateRoomModal(false);
                setPrivateRoomName("");
                setRoomNameError("");
              }}
            >
              ×
            </button>

            <h2 className="text-2xl font-bold text-white mb-6">Create Private Room</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Room Name</label>
              <input
                type="text"
                value={privateRoomName}
                onChange={(e) => {
                  setPrivateRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                  setRoomNameError(""); // Clear error when typing
                }}
                placeholder="my-awesome-room"
                className={`w-full px-4 py-3 rounded-lg bg-[#23272b] text-white border outline-none font-mono ${
                  roomNameError ? "border-red-500 focus:border-red-500" : "border-[#23272b] focus:border-[#FFAA00]"
                }`}
                maxLength={30}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && privateRoomName.trim()) {
                    handleCreatePrivateRoom();
                  } else if (e.key === "Escape") {
                    setShowPrivateRoomModal(false);
                    setPrivateRoomName("");
                    setRoomNameError("");
                  }
                }}
              />
              {roomNameError ? (
                <p className="text-xs text-red-400 mt-2">{roomNameError}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-2">Only lowercase letters, numbers, and hyphens allowed</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition cursor-pointer"
                onClick={() => {
                  setShowPrivateRoomModal(false);
                  setPrivateRoomName("");
                  setRoomNameError("");
                }}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-4 py-3 bg-[#FFAA00] text-white rounded-lg hover:bg-[#FFB833] transition disabled:opacity-50 cursor-pointer"
                disabled={!privateRoomName.trim()}
                onClick={handleCreatePrivateRoom}
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
