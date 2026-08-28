import { supabase } from './supabaseClient.js';
import { maybeShowWelcomeModal } from './welcomemodal.js';

document.addEventListener('DOMContentLoaded', () => {

    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginView = document.getElementById('loginView');
    const signupView = document.getElementById('signupView');

    // Default view
    loginView.style.display = 'block';
    signupView.style.display = 'none';

    // ============================
    // LOGIN
    // ============================
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();

            const { error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                alert("Login failed: " + error.message);
                return;
            }

            window.location.href = "./profile.html";
        });
    }

    // ============================
    // FORGOT PASSWORD
    // ============================

const forgotPasswordLink = document.getElementById("forgotPasswordLink");

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", () => {
        console.log("Forgot password clicked");
        window.location.href = "./reset.html";
    });
}

    // ============================
    // SIGNUP
    // ============================
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const firstname = document.getElementById('firstname').value.trim();
            const lastname = document.getElementById('lastname').value.trim();
            const username = document.getElementById('newUsername').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('newPassword').value.trim();

            console.log({ firstname, lastname, username, email, password });

            const selectedAvatar = document.querySelector('#avatarGrid .avatar-option.selected')?.src;
            const selectedBanner = document.querySelector('#signupBannerGrid .banner-option.selected')?.src;

            if (!firstname || !lastname || !username || !email || !password) {
                alert("Please fill out all fields.");
                return;
            }

            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email,
                password
            });

            if (signUpError) {
                alert("Signup failed: " + signUpError.message);
                return;
            }

            const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (loginError) {
                alert("Auto-login failed: " + loginError.message);
                return;
            }

            const user = loginData.user;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    firstname,
                    lastname,
                    username,
                    display_name: firstname,
                    avatar_url: selectedAvatar || "Ash Ketchum User.jpg",
                    banner_url: selectedBanner || "Arcanine_Full.png",
                    bio: "New Trainer on Dexoria!"
                })
                .eq('id', user.id);

            if (updateError) {
                alert("Profile update failed: " + updateError.message);
                return;
            }

            // Show the welcome modal for new accounts and wait for it to
            // close before moving on, so the user actually gets to read it.
            await maybeShowWelcomeModal(supabase, user);

            window.location.href = "./profile.html";
        });
    }

    // ============================
    // AVATAR + BANNER SELECTION
    // ============================
    document.querySelectorAll('#avatarGrid .avatar-option').forEach(img => {
        img.onclick = () => {
            document.querySelectorAll('#avatarGrid .avatar-option')
                .forEach(a => a.classList.remove('selected'));
            img.classList.add('selected');
        };
    });

    document.querySelectorAll('#signupBannerGrid .banner-option').forEach(img => {
        img.onclick = () => {
            document.querySelectorAll('#signupBannerGrid .banner-option')
                .forEach(b => b.classList.remove('selected'));
            img.classList.add('selected');
        };
    });

    // ============================
    // VIEW SWITCHING
    // ============================
    document.getElementById('toSignup').onclick = (e) => {
        e.preventDefault();
        loginView.style.display = 'none';
        signupView.style.display = 'block';
    };

    document.getElementById('toLogin').onclick = (e) => {
        e.preventDefault();
        signupView.style.display = 'none';
        loginView.style.display = 'block';
    };
});
