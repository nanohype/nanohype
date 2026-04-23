.PHONY: run test package lint clean docker docker-run

run:
	mvn spring-boot:run -Dspring-boot.run.profiles=local

test:
	mvn test

verify:
	mvn verify

package:
	mvn -DskipTests package

lint:
	mvn -q -Dmaven.test.skip=true checkstyle:check || true
	mvn -q compile

clean:
	mvn clean

docker:
	mvn -DskipTests spring-boot:build-image

docker-run:
	docker compose up --build
