#![windows_subsystem = "windows"]

fn main() {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    polycode_lib::ensure_macos_dev_bundle();
    polycode_lib::run()
}
