#!/bin/bash
set -euo pipefail

echo "🚀 Installing AI Code Review Tool..."

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "⚠️ bun could not be found. Please install it first from https://bun.sh"
    exit 1
fi

INSTALL_DIR="$HOME/.ai-code-review"
EXPECTED_REMOTE_SUFFIX="/Aditya190803/ai-code-review.git"
REPO_URL="https://github.com/Aditya190803/ai-code-review.git"
COMMIT_HASH="HEAD" # TODO: Check integrity

needs_fresh_clone=0
if [ -d "$INSTALL_DIR" ]; then
    if [ ! -d "$INSTALL_DIR/.git" ]; then
        echo "⚠️ Existing directory is not a git repository: $INSTALL_DIR"
        needs_fresh_clone=1
    elif [ ! -f "$INSTALL_DIR/app.tsx" ] || [ ! -f "$INSTALL_DIR/package.json" ]; then
        echo "⚠️ Existing installation does not look like this Bun CLI project."
        needs_fresh_clone=1
    else
        origin_url=$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)
        if [[ "$origin_url" != *"$EXPECTED_REMOTE_SUFFIX" ]]; then
            echo "⚠️ Existing installation points to a different repository: $origin_url"
            needs_fresh_clone=1
        fi
    fi
fi

if [ "$needs_fresh_clone" -eq 1 ]; then
    backup_dir="$INSTALL_DIR.backup.$(date +%Y%m%d-%H%M%S)"
    echo "🗂️ Backing up current installation to $backup_dir"
    mv "$INSTALL_DIR" "$backup_dir"
fi

if [ -d "$INSTALL_DIR" ]; then
    echo "🔄 Updating existing installation in $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    # Stash any local modifications to prevent conflicts
    STASH_OUTPUT=$(git stash --include-untracked 2>/dev/null || true)
    git pull --ff-only || { echo "⚠️ Could not fast-forward. Resetting to latest..."; git fetch origin && git reset --hard @{u}; }
    if [[ "$STASH_OUTPUT" != "No local changes to save" && -n "$STASH_OUTPUT" ]]; then
        git stash pop --quiet || echo "⚠️ Warning: git stash pop resulted in conflicts. Please resolve them manually."
    fi
else
    echo "📦 Cloning repository to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Clean up any stale lockfiles and install fresh
echo "📦 Installing dependencies..."
bun install --frozen-lockfile

echo "🔗 Linking globally..."
cat << 'EOF' > ai-review-wrapper.sh
#!/bin/bash
set -euo pipefail

INSTALL_DIR="$(dirname "$(realpath "$0")")"

if [ ! -f "$INSTALL_DIR/app.tsx" ]; then
    echo "error: Module not found \"$INSTALL_DIR/app.tsx\""
    echo "This installation looks incomplete or outdated. Re-run install.sh."
    exit 1
fi

exec bun run "$INSTALL_DIR/app.tsx" "$@"
EOF
chmod +x ai-review-wrapper.sh

mkdir -m 755 -p "$HOME/.local/bin"
# prevent global symlink hijacking
if [ -e "$HOME/.local/bin/ai-review" ] && [ ! -O "$HOME/.local/bin/ai-review" ]; then
    echo "⚠️ Warning: $HOME/.local/bin/ai-review exists and is not owned by the current user. Skipping symlink creation to prevent hijacking."
else
    ln -snf "$INSTALL_DIR/ai-review-wrapper.sh" "$HOME/.local/bin/ai-review"
fi

# Add ~/.local/bin to PATH if not already present
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    SHELL_NAME=$(basename "$SHELL")
    if [ "$SHELL_NAME" = "zsh" ]; then
        SHELL_RC="$HOME/.zshrc"
    elif [ "$SHELL_NAME" = "bash" ]; then
        SHELL_RC="$HOME/.bashrc"
    else
        SHELL_RC="$HOME/.profile"
    fi

    if ! grep -q '.local/bin' "$SHELL_RC" 2>/dev/null; then
        echo '' >> "$SHELL_RC"
        echo '# AI Code Review Tool' >> "$SHELL_RC"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
        echo "✅ Added ~/.local/bin to PATH in $SHELL_RC"
    fi

    export PATH="$HOME/.local/bin:$PATH"
    echo "   Applied to current session."
fi

echo ""
echo "✨ Installation complete! You can now run 'ai-review' in any Git repository."
