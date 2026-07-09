function pickFiles({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/png,image/jpeg';
    input.multiple = multiple;
    input.style.display = 'none';

    input.addEventListener(
      'change',
      () => {
        resolve(Array.from(input.files || []));
        input.remove();
      },
      { once: true }
    );

    document.body.appendChild(input);
    input.click();
  });
}

function titleFromFilename(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

// Common interface every import source implements, so cloud sources (Google
// Drive, Dropbox, ...) can register alongside this one later in js/import/index.js
// without the Library page or storage layer needing to change:
//
//   id:     stable identifier
//   label:  shown in the upload source picker
//   icon:   Framework7 icon name
//   pick(): Promise<Array<{ title, mimeType, blob }>>
export const localSource = {
  id: 'local',
  label: 'Upload from device',
  icon: 'square_arrow_up',
  async pick() {
    const files = await pickFiles();
    return files.map((file) => ({
      title: titleFromFilename(file.name),
      mimeType: file.type,
      blob: file,
    }));
  },
};
