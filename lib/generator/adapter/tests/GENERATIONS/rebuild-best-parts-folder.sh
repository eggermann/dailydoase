#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
TARGET_ROOT="${SCRIPT_DIR}/best"
TARGET_PARTS="${TARGET_ROOT}/parts"
START_AT="${BEST_PARTS_START_AT:-${1:-}}"
START_AT_NUMBER=""
START_AT_SUFFIX=""
START_AT_FOUND=0

mkdir -p "${TARGET_PARTS}"
find "${TARGET_PARTS}" -mindepth 1 -maxdepth 1 -exec rm -f {} +

if [ -n "${START_AT}" ]; then
  START_AT_NUMBER=$(printf '%s\n' "${START_AT}" | sed -n 's/^\([0-9][0-9]*\).*/\1/p')
  START_AT_SUFFIX=$(printf '%s\n' "${START_AT}" | sed -n 's/^[0-9][0-9]*-\(.*\)$/\1/p')
fi

for generation_dir in $(find "${SCRIPT_DIR}" -mindepth 1 -maxdepth 1 -type d ! -name archive ! -name best | sort); do
  [ -n "${generation_dir}" ] || continue
  generation_name=$(basename "${generation_dir}")
  generation_number=$(printf '%s\n' "${generation_name}" | sed -n 's/^\([0-9][0-9]*\).*/\1/p')

  if [ -n "${START_AT}" ]; then
    if [ "${generation_name}" = "${START_AT}" ] || [ "${generation_dir}" = "${START_AT}" ]; then
      START_AT_FOUND=1
    fi

    if [ -n "${START_AT_SUFFIX}" ]; then
      generation_suffix=$(printf '%s\n' "${generation_name}" | sed -n 's/^[0-9][0-9]*-\(.*\)$/\1/p')
      if [ "${generation_suffix}" != "${START_AT_SUFFIX}" ]; then
        continue
      fi
    fi

    if [ -n "${START_AT_NUMBER}" ] && [ -n "${generation_number}" ]; then
      if [ "${generation_number}" -lt "${START_AT_NUMBER}" ]; then
        continue
      fi
      START_AT_FOUND=1
    elif [ "${START_AT_FOUND}" -eq 0 ]; then
      continue
    fi

    if [ -z "${START_AT_NUMBER}" ] && [ "${START_AT_FOUND}" -eq 0 ]; then
      continue
    fi
  fi

  parts_dir="${generation_dir}/parts"
  if [ ! -d "${parts_dir}" ]; then
    continue
  fi

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

if [ -n "${START_AT}" ] && [ "${START_AT_FOUND}" -eq 0 ]; then
  echo "Start generation not found: ${START_AT}" >&2
  exit 1
fi

printf '%s\n' "${TARGET_PARTS}"
