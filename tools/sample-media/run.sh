#!/bin/sh
# Fetch and prepare the media of one sample quiz, or of all of them:
#   tools/sample-media/run.sh [<sample-folder-name>]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
docker build -q -t quizdock-sample-media "$here" >/dev/null
docker run --rm -v "$root/apps/backend/samples:/work" quizdock-sample-media "$@"
