export default {
  async fetch(request) {
    const url = new URL(request.url);

    return new Response(
      `C2Z Facebed Worker\n\nPath: ${url.pathname}`,
      {
        headers: {
          "content-type": "text/plain; charset=UTF-8"
        }
      }
    );
  }
};