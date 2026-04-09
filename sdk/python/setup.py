from setuptools import setup, find_packages

setup(
    name="omnisight",
    version="1.0.0",
    description="OmniSight Python SDK — The Bloomberg Terminal for Prediction Markets",
    long_description=open("../../README.md").read() if __import__("os").path.exists("../../README.md") else "",
    long_description_content_type="text/markdown",
    author="OmniSight",
    url="https://github.com/omnisight/omnisight-python",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "httpx>=0.25.0",
        "websockets>=12.0",
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Office/Business :: Financial",
    ],
)
