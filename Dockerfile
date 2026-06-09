FROM php:8.2-apache

RUN a2enmod rewrite headers \
    && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

WORKDIR /var/www/html

COPY . .

RUN mkdir -p data \
    && chown -R www-data:www-data data \
    && chmod -R 775 data

EXPOSE 80
