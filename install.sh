#!/bin/bash
set -euo pipefail

echo "🚀 Installing AI Code Review Tool..."

# Check for bun
if ! command -v bun &> /dev/null; then
    echo "⚠️ bun could not be found. Please install it first from https://bun.sh"
    exit 1
fi

INSTALL_DIR="$HOME/.ai-code-review"

if [ -d "$INSTALL_DIR" ]; then
    echo "🔄 Updating existing installation in $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    # Stash any local modifications to prevent conflicts
    git stash --include-untracked --quiet 2>/dev/null || true
    git pull --ff-only || { echo "⚠️ Could not fast-forward. Resetting to latest..."; git fetch origin && git reset --hard origin/main; }
    git stash pop --quiet 2>/dev/null || true
else
    echo "📦 Cloning repository to $INSTALL_DIR..."
    git clone https://github.com/Aditya190803/ai-code-review.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Clean up any stale lockfiles and install fresh
echo "📦 Installing dependencies..."
bun install

echo "🔗 Linking globally..."
cat << 'EOF' > ai-review-wrapper.sh
#!/bin/bash
bun run "$HOME/.ai-code-review/app.tsx" "$@"
EOF
chmod +x ai-review-wrapper.sh

mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL_DIR/ai-review-wrapper.sh" "$HOME/.local/bin/ai-review"

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
