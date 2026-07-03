source "https://rubygems.org"

# fastlane drives the signed iOS (match + gym + pilot) and Android (gradle +
# firebase_app_distribution + supply) release lanes. See docs/ci-cd-signed-release.md.
gem "fastlane", "~> 2.225"

# Android lanes need the Firebase App Distribution plugin.
plugins_path = File.join(File.dirname(__FILE__), "android", "fastlane", "Pluginfile")
eval_gemfile(plugins_path) if File.exist?(plugins_path)
