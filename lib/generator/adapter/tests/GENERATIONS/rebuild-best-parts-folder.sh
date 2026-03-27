#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
TARGET_ROOT="${SCRIPT_DIR}/best"
TARGET_PARTS="${TARGET_ROOT}/parts"

mkdir -p "${TARGET_PARTS}"
find "${TARGET_PARTS}" -mindepth 1 -maxdepth 1 -exec rm -f {} +

find "${SCRIPT_DIR}" -mindepth 2 -maxdepth 2 -type d -name parts | while read -r parts_dir; do
  case "${parts_dir}" in
    */archive/*|*/best/*)
      continue
      ;;
  esac

  generation_dir=$(dirname "${parts_dir}")
  generation_name=$(basename "${generation_dir}")

  find "${parts_dir}" -mindepth 1 -maxdepth 1 -type f \( -name '*.mp4' -o -name '*.mov' -o -name '*.webm' \) | sort | while read -r video_path; do
    video_name=$(basename "${video_path}")
    video_base=${video_name%.*}
    video_ext=${video_name##*.}
    link_stub="${generation_name}__${video_base}"
    link_name="${link_stub}.${video_ext}"
    link_path="${TARGET_PARTS}/${link_name}"
    suffix=1

    while [ -e "${link_path}" ]; do
      link_name="${link_stub}__${suffix}.${video_ext}"
      link_path="${TARGET_PARTS}/${link_name}"
      suffix=$((suffix + 1))
    done

    ln -sf "${video_path}" "${link_path}"

    json_path="${parts_dir}/${video_base}.json"
    if [ -f "${json_path}" ]; then
      ln -sf "${json_path}" "${TARGET_PARTS}/${link_name%.*}.json"
    fi
  done
done

printf '%s\n' "${TARGET_PARTS}"
