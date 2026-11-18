//! Normalize the content type supplied by Windows media thumbnails.

pub fn artwork_mime(content_type: &str) -> &str {
    // SMTC may advertise aliases as a comma-separated list. A data URL accepts
    // only one media type: a comma otherwise starts the payload prematurely.
    let mime = content_type.split(',').next().unwrap_or_default().trim();
    if mime.starts_with("image/") { mime } else { "image/jpeg" }
}

#[cfg(test)]
mod tests {
    use super::artwork_mime;

    #[test]
    fn apple_music_comma_list_uses_first_image_type() {
        assert_eq!(artwork_mime("image/jpeg,image/jpe,image/jpg"), "image/jpeg");
        assert_eq!(artwork_mime(" image/png , image/jpeg "), "image/png");
    }

    #[test]
    fn missing_or_non_image_types_fall_back_to_jpeg() {
        for mime in ["", "   ", "application/octet-stream", "text/plain,image/png"] {
            assert_eq!(artwork_mime(mime), "image/jpeg", "{mime:?}");
        }
    }

    #[test]
    fn single_image_types_are_preserved() {
        for mime in ["image/jpeg", "image/png", "image/webp"] {
            assert_eq!(artwork_mime(mime), mime);
        }
    }
}
