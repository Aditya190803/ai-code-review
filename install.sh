#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Installing AI Code Review Tool..."

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "⚠️ bun could not be found. Please install it first from https://bun.sh"
    exit 1
fi

INSTALL_DIR="$HOME/.ai-code-review"
EXPECTED_REMOTE_SUFFIX="/Aditya190803/ai-code-review.git"
REPO_URL="${AI_CODE_REVIEW_REPO_URL:-https://github.com/Aditya190803/ai-code-review.git}"
REPO_REF="${AI_CODE_REVIEW_REPO_REF:-8b2b112667ff7ce8b1f1dbb3e4a02edcf34879f5}"

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
    if ! git diff --quiet || ! git diff --cached --quiet; then
        if ! git stash push --include-untracked --message "ai-code-review-install" >/dev/null; then
            echo "⚠️ Could not stash local changes safely. Aborting to avoid data loss."
            exit 1
        fi
        had_stash=1
    else
        had_stash=0
    fi

    git fetch origin "$REPO_REF"
    git checkout --detach "$REPO_REF"
    git reset --hard "$REPO_REF"

    if [ "$had_stash" -eq 1 ]; then
        if ! git stash pop --quiet; then
            echo "⚠️ Warning: git stash pop resulted in conflicts. Please resolve them manually."
        fi
    fi
else
    echo "📦 Cloning repository to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    git checkout --detach "$REPO_REF"
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

exec bun run --cwd "$INSTALL_DIR" app.tsx "$@"
EOF
chmod +x ai-review-wrapper.sh

mkdir -m 755 -p "$HOME/.local/bin"
AI_REVIEW_BIN="$HOME/.local/bin/ai-review"
WRAPPER_PATH="$INSTALL_DIR/ai-review-wrapper.sh"

if [ -e "$AI_REVIEW_BIN" ] || [ -L "$AI_REVIEW_BIN" ]; then
    if [ -L "$AI_REVIEW_BIN" ]; then
        existing_target=$(realpath "$AI_REVIEW_BIN" 2>/dev/null || true)
        if [[ "$existing_target" != "$WRAPPER_PATH" && "$existing_target" != "$INSTALL_DIR/"* ]]; then
            echo "⚠️ Warning: $AI_REVIEW_BIN points outside the installation directory. Skipping symlink creation to prevent hijacking."
            exit 1
        fi
    elif [ ! -O "$AI_REVIEW_BIN" ]; then
        echo "⚠️ Warning: $AI_REVIEW_BIN exists and is not owned by the current user. Skipping symlink creation to prevent hijacking."
        exit 1
    fi
fi

ln -snf "$WRAPPER_PATH" "$AI_REVIEW_BIN"

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
