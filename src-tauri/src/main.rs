#![windows_subsystem = "windows"]

fn main() {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    monocode_lib::ensure_macos_dev_bundle();
    monocode_lib::run()
}
